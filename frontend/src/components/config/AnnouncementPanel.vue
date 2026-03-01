<script setup>
import { ref, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import dayjs from 'dayjs';
import '@wangeditor/editor/dist/css/style.css';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import { DomEditor } from '@wangeditor/editor'

const props = defineProps({
  configKey: {
    type: String,
    default: '',
  },
  isKeyVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
});

const announcements = ref([]);
const announcementsLoading = ref(false);
const announcementsError = ref(null);
const announcementsSuccess = ref(null);
const isAnnouncementSubmitting = ref(false);
const editorRef = shallowRef();
const toolbarConfig = {
  excludeKeys: ['group-video', 'codeBlock','todo','insertLink','emotion'],
};
const editorConfig = {
  placeholder: '请输入公告富文本内容',
  MENU_CONF:{
    uploadImage: {
      base64LimitSize: 1 * 1024 * 1024,
    },
  }
};
const announcementForm = ref({
  id: null,
  title: '',
  summary: '',
  contentHtml: '',
  startDate: '',
  endDate: '',
});
const isEditingAnnouncement = ref(false);

function fetchAnnouncements() {
  announcementsError.value = null;
  announcementsSuccess.value = null;
  announcementsLoading.value = true;
  fetch('/api/announcements/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: props.configKey }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '获取公告列表失败');
      }
      if (data.success) {
        announcements.value = data.announcements || [];
      } else {
        throw new Error(data.error || '获取公告列表失败');
      }
    })
    .catch((err) => {
      announcementsError.value = err.message;
    })
    .finally(() => {
      announcementsLoading.value = false;
    });
}

function resetAnnouncementForm() {
  announcementForm.value = {
    id: null,
    title: '',
    summary: '',
    contentHtml: '',
    startDate: '',
    endDate: '',
  };
  isEditingAnnouncement.value = false;
}

function editAnnouncement(item) {
  announcementForm.value = {
    id: item.id,
    title: item.title,
    summary: item.summary,
    contentHtml: item.contentHtml,
    startDate: item.startDate,
    endDate: item.endDate,
  };
  isEditingAnnouncement.value = true;
}

function handleEditorCreated(editor) {
  editorRef.value = editor;
}

function submitAnnouncement() {
  announcementsError.value = null;
  announcementsSuccess.value = null;
  if (!props.isKeyVerified || !props.configKey) {
    announcementsError.value = '请先验证密钥';
    return;
  }
  const payload = {
    key: props.configKey,
    id: announcementForm.value.id,
    title: announcementForm.value.title.trim(),
    summary: announcementForm.value.summary.trim(),
    contentHtml: announcementForm.value.contentHtml.trim(),
    startDate: announcementForm.value.startDate,
    endDate: announcementForm.value.endDate,
  };
  if (!payload.title || !payload.summary || !payload.contentHtml || !payload.startDate || !payload.endDate) {
    announcementsError.value = '请完整填写公告信息';
    return;
  }
  const startDate = dayjs(payload.startDate);
  const endDate = dayjs(payload.endDate);
  if (!startDate.isValid() || !endDate.isValid()) {
    announcementsError.value = '日期格式不正确';
    return;
  }
  if (endDate.isBefore(startDate, 'day')) {
    announcementsError.value = '结束日期不能早于开始日期';
    return;
  }
  isAnnouncementSubmitting.value = true;
  const url = isEditingAnnouncement.value ? '/api/announcements/update' : '/api/announcements/create';
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '公告保存失败');
      }
      if (data.success) {
        announcementsSuccess.value = isEditingAnnouncement.value ? '公告已更新' : '公告已新增';
        resetAnnouncementForm();
        fetchAnnouncements();
      } else {
        throw new Error(data.error || '公告保存失败');
      }
    })
    .catch((err) => {
      announcementsError.value = err.message;
    })
    .finally(() => {
      isAnnouncementSubmitting.value = false;
    });
}

function getAnnouncementStatus(item) {
  const now = dayjs();
  const start = dayjs(item.startDate);
  const end = dayjs(item.endDate).endOf('day');
  if (!start.isValid() || !end.isValid()) {
    return '未知';
  }
  if (now.isBefore(start)) {
    return '未开始';
  }
  if (now.isAfter(end)) {
    return '已结束';
  }
  return '进行中';
}

function getAnnouncementStatusClass(status) {
  if (status === '进行中') return 'status-active';
  if (status === '未开始') return 'status-upcoming';
  if (status === '已结束') return 'status-ended';
  return 'status-unknown';
}

watch(
  () => [props.isActive, props.isKeyVerified, props.configKey],
  () => {
    if (props.isActive && props.isKeyVerified && props.configKey) {
      fetchAnnouncements();
    }
  }
);

onMounted(() => {
  if (props.isActive && props.isKeyVerified && props.configKey) {
    fetchAnnouncements();
  }
});

onBeforeUnmount(() => {
  if (editorRef.value) {
    editorRef.value.destroy();
    editorRef.value = null;
  }
});
</script>

<template>
  <div class="announcement-card">
    <div class="announcement-header">
      <div>
        <h2 class="card-title">公告配置</h2>
        <p class="announcement-subtitle">当前公告：{{ announcements.length }} / 2000</p>
      </div>
      <button class="ghost-button" @click="resetAnnouncementForm">新增公告</button>
    </div>

    <div class="announcement-form">
      <div class="input-row">
        <label>标题</label>
        <input v-model="announcementForm.title" placeholder="请输入公告标题" />
      </div>
      <div class="input-row">
        <label>摘要</label>
        <input v-model="announcementForm.summary" placeholder="请输入摘要内容" />
      </div>
      <div class="input-row">
        <label>开始日期</label>
        <input v-model="announcementForm.startDate" type="date" />
      </div>
      <div class="input-row">
        <label>结束日期</label>
        <input v-model="announcementForm.endDate" type="date" />
      </div>
      <div class="input-row editor-row">
        <label>富文本内容</label>
        <div class="editor-shell">
          <Toolbar class="announcement-toolbar" :editor="editorRef" :defaultConfig="toolbarConfig" mode="default" />
          <Editor
            class="announcement-editor"
            v-model="announcementForm.contentHtml"
            :defaultConfig="editorConfig"
            mode="default"
            height="300px"
            @onCreated="handleEditorCreated"
          />
        </div>
      </div>
      <div class="form-actions inline-actions">
        <button class="submit-button" @click="submitAnnouncement" :disabled="isAnnouncementSubmitting">
          {{ isAnnouncementSubmitting ? '保存中...' : (isEditingAnnouncement ? '更新公告' : '新增公告') }}
        </button>
      </div>
      <div v-if="announcementsError" class="form-error submit-status">{{ announcementsError }}</div>
      <div v-if="announcementsSuccess" class="form-success submit-status">{{ announcementsSuccess }}</div>
    </div>

    <div class="announcement-list">
      <div v-if="announcementsLoading" class="loading-indicator">正在加载公告...</div>
      <div v-else-if="announcements.length === 0" class="no-data-message">暂无公告</div>
      <table v-else class="announcement-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>时间</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in announcements" :key="item.id">
            <td class="announcement-title">{{ item.title }}</td>
            <td>{{ item.startDate }} - {{ item.endDate }}</td>
            <td>
              <span :class="['status-tag', getAnnouncementStatusClass(getAnnouncementStatus(item))]">
                {{ getAnnouncementStatus(item) }}
              </span>
            </td>
            <td>{{ dayjs(item.createdAt).format('MM-DD HH:mm') }}</td>
            <td>
              <button class="text-button" @click="editAnnouncement(item)">编辑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.announcement-card {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 45px rgba(32, 16, 18, 0.12);
  border: 1px solid rgba(120, 35, 45, 0.08);
  backdrop-filter: blur(6px);
  display: grid;
  gap: 16px;
}

.announcement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.announcement-subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: #6a4a4e;
}

.ghost-button {
  background: transparent;
  border: 1px dashed rgba(120, 35, 45, 0.35);
  color: #6b2b33;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}

.announcement-form {
  display: grid;
  gap: 12px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-row label {
  font-size: 0.75rem;
  color: #4b4b4b;
  font-weight: 600;
  white-space: nowrap;
  min-width: 52px;
}

.input-row input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid rgba(120, 35, 45, 0.2);
  border-radius: 10px;
  font-size: 0.85rem;
  text-align: center;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-row input:focus {
  outline: none;
  border-color: rgba(120, 35, 45, 0.45);
  box-shadow: 0 0 0 3px rgba(120, 35, 45, 0.12);
}

.editor-row {
  align-items: flex-start;
}

.editor-shell {
  flex: 1;
  border: 1px solid rgba(120, 35, 45, 0.2);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.9);
}

.announcement-toolbar {
  border-bottom: 1px solid rgba(120, 35, 45, 0.15);
}

.announcement-editor :deep(.w-e-scroll){
  min-height: 300px;
}

.inline-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.form-actions {
  margin-top: 18px;
}

.submit-button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #8c1a2b 0%, #d08c4a 100%);
  color: #fff9f1;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 10px 20px rgba(140, 26, 43, 0.25);
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 16px 30px rgba(140, 26, 43, 0.28);
}

.submit-button:disabled {
  background: #c9c4bc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.form-error,
.form-success {
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 18px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
}

.submit-status {
  margin-top: 12px;
  margin-bottom: 0;
}

.form-error {
  background-color: rgba(168, 27, 38, 0.08);
  color: #a31f2d;
  border: 1px solid rgba(168, 27, 38, 0.2);
}

.form-success {
  background-color: rgba(23, 128, 86, 0.1);
  color: #1b7c55;
  border: 1px solid rgba(23, 128, 86, 0.2);
}

.announcement-list {
  display: grid;
  gap: 12px;
}

.announcement-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px;
}

.announcement-table th,
.announcement-table td {
  padding: 10px 8px;
  text-align: left;
  border-bottom: 1px solid rgba(120, 35, 45, 0.08);
}

.announcement-title {
  font-weight: 700;
  color: #3b1c1f;
}

.status-tag {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.4px;
}

.status-active {
  background: rgba(31, 124, 85, 0.12);
  color: #1f7c55;
}

.status-upcoming {
  background: rgba(208, 140, 74, 0.15);
  color: #a7642e;
}

.status-ended {
  background: rgba(168, 27, 38, 0.12);
  color: #a31f2d;
}

.status-unknown {
  background: rgba(107, 107, 107, 0.12);
  color: #6b6b6b;
}

.text-button {
  background: none;
  border: none;
  color: #8c1a2b;
  cursor: pointer;
  font-weight: 600;
  padding: 0;
}

.card-title {
  margin: 0 0 18px 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b0d13;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(120, 35, 45, 0.25);
  letter-spacing: 0.8px;
}

.loading-indicator,
.no-data-message {
  text-align: center;
  padding: 22px;
  color: #5a3a3e;
  font-size: 0.85rem;
  font-weight: 600;
}
</style>
