<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { useMessage } from "zenless-ui";
import type {
  Category,
  DraftArticle,
  ExternalVideo,
  UploadedFile,
  UploadTask,
  UploadStatus,
} from "~/types/entities";
import type { Pagination } from "~/types/api";
import {
  ArrowUpTrayIcon,
  PhotoIcon,
  XMarkIcon,
  Cog6ToothIcon,
  TrashIcon,
  ChevronRightIcon,
  RectangleStackIcon,
  EyeSlashIcon,
  HashtagIcon,
  CheckIcon,
  PlusCircleIcon,
  InboxIcon,
  FilmIcon,
} from "@heroicons/vue/24/outline";
import { PlayIcon } from "@heroicons/vue/24/solid";
import { resolveErrorMessage } from "~/utils/api-error";
import { toThumbUrl } from "~/utils/image";
import { isAllowedImage, MAX_IMAGE_SIZE } from "~/utils/upload";

const AUTO_SAVE_DELAY = 800;

const api = useApi();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const loginDialog = useLoginDialog();
const confirmDialog = useConfirmDialog();
const message = useMessage();
const pendingPost = usePendingPost();
// 发帖图片数与正文字数上限（固定值）
const maxCoverImages = 9;
const maxBodyChars = 16000;

useSeoMeta({
  title: "发布帖子 - 绳网",
  robots: "noindex, nofollow",
});

if (import.meta.client && !auth.isLogin) {
  loginDialog.open();
  router.replace("/");
}

/* ── Reactive State ───────────────────────────────── */
const title = ref("");
const body = ref("");
const externalVideos = ref<ExternalVideo[]>([]);
const uploadTasks = ref<UploadTask[]>([]);
const documentId = ref<string | null>(null);
const isSavingDraft = ref(false);
const isPublishing = ref(false);
const isDeletingDraft = ref(false);
const isDiscardingChanges = ref(false);
const hasUnsavedChanges = ref(false);
const lastSavedAt = ref<Date | null>(null);
// 编辑器：正文编辑/预览模式与 Markdown 插入
const bodyMode = ref<"edit" | "preview">("edit");
const bodyTextareaRef = ref<InstanceType<any>>();
// 编辑已发布帖子模式：自动保存仍写 draft 版本，点「更新帖子」后重新发布。
const isEditingPublished = ref(false);
const isAnonymous = ref(false);
const showImagePickerModal = ref(false);
const isVideoDialogVisible = ref(false);

// 鼠标悬停/聚焦在「添加图片」或「添加视频」上时，高亮对应类型并禁用另一个入口
const hoveredMediaType = ref<"image" | "video" | null>(null);
const activeMediaType = computed(() => {
  if (isVideoDialogVisible.value || hoveredMediaType.value === "video") return "video";
  if (showImagePickerModal.value || hoveredMediaType.value === "image") return "image";
  return null;
});

function onMediaEnter(type: "image" | "video") {
  hoveredMediaType.value = type;
}
function onMediaLeave(type: "image" | "video") {
  if (hoveredMediaType.value === type) hoveredMediaType.value = null;
}

/* ── 帖子分类（频道）：发布帖子必选，默认兜底「综合」 ── */
const DEFAULT_CATEGORY_SLUG = "general";
const categories = ref<Category[]>([]);
const selectedCategory = ref<string>(DEFAULT_CATEGORY_SLUG);
// 频道列表是否仍在首次加载：用于在无缓存冷启动时渲染占位标签预留高度，
// 避免列表后到把正文区往下挤导致页面跳动。
const categoriesLoading = ref(true);
// 仅管理员可发布帖子的分区，对非管理员隐藏（后端发布帖子时同样会拦截，前端只是不展示入口）。
const visibleCategories = computed(() =>
  categories.value.filter((c) => !c.adminOnly || auth.user?.isAdmin === true),
);
// 标签行直接展示的最大个数，超过则收起进「全部」下拉
const TAG_CHIPS_MAX = 6;

/* ── Mobile-only UI state ─────────────────────────── */
const isMobileDraftsOpen = ref(false);
const isMobileSettingsOpen = ref(false);
const isMobileCategoryOpen = ref(false);
// 移动端「分类」设置行展示的当前频道名（找不到则按加载态兜底文案）。
const selectedCategoryName = computed(() => {
  const found = categories.value.find((c) => c.slug === selectedCategory.value);
  if (found) return found.name;
  return categoriesLoading.value ? "加载中…" : "请选择";
});

const suppressTracking = ref(false);
const lastSavedSnapshot = ref("");

// Draft list
const drafts = ref<DraftArticle[]>([]);
const draftsCursor = ref("");
const draftsHasNext = ref(true);
const draftsLoading = ref(false);
const draftsInitialized = ref(false);

/* ── Computed ─────────────────────────────────────── */
const uploadedImages = computed(() =>
  uploadTasks.value
    .filter((t) => t.status === "done" && t.serverId && t.serverUrl)
    .map((t) => ({ id: t.serverId!, url: t.serverUrl! })),
);

const isCoverUploading = computed(() =>
  uploadTasks.value.some(
    (t) => t.status === "uploading" || t.status === "pending",
  ),
);

const remainingCoverSlots = computed(() =>
  Math.max(0, maxCoverImages - uploadTasks.value.length),
);

const bodyCharCount = computed(() => body.value.length);
const isBodyOverLimit = computed(() => bodyCharCount.value > maxBodyChars);

const existingUploadIds = computed(() =>
  uploadTasks.value
    .map((task) => task.serverId)
    .filter((id): id is string => typeof id === "string" && id.length > 0),
);

const hasAnyContent = computed(
  () =>
    title.value.trim().length > 0 ||
    body.value.trim().length > 0 ||
    externalVideos.value.length > 0 ||
    uploadedImages.value.length > 0,
);

const canPublish = computed(
  () =>
    !isSavingDraft.value &&
    !isPublishing.value &&
    !isDeletingDraft.value &&
    !isCoverUploading.value &&
    !isBodyOverLimit.value &&
    title.value.trim().length > 0 &&
    (body.value.trim().length > 0 || externalVideos.value.length > 0 || uploadedImages.value.length > 0),
);

const coverPayload = computed(() => {
  const imgs = uploadedImages.value;
  if (imgs.length === 0) return [];
  if (imgs.length === 1) return imgs[0]!.id;
  return imgs.map((i) => i.id);
});

const MAX_EXTERNAL_VIDEOS = 9;
const BVID_RE = /^BV[0-9A-Za-z]{10}$/;
const AVID_RE = /^(?:av)?(\d+)$/i;
// 支持 bilibili.com/video/BV..、bilibili.com/video/av123、b23.tv/xxx（短链）、
// 以及 m.bilibili.com / www.bilibili.com 等带任意前后缀的链接。
const BILIBILI_URL_RE = /(?:bilibili\.com\/(?:video\/|s\/video\/)?(BV[0-9A-Za-z]{10})|bilibili\.com\/video\/(?:av)?(\d+)|b23\.tv\/[0-9A-Za-z]+)/i;

function buildBilibiliEmbedUrl(
  bvid: string | null | undefined,
  aid: number | null | undefined,
  cid: number | null | undefined,
  p: number | null | undefined,
): string {
  const params = new URLSearchParams();
  if (bvid) params.set("bvid", bvid);
  if (aid) params.set("aid", String(aid));
  if (cid) params.set("cid", String(cid));
  if (p && p > 0) {
    params.set("p", String(p));
  }
  params.set("autoplay", "0");
  params.set("danmaku", "0");
  params.set("poster", "1");
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

async function parseBilibiliVideo(input: string): Promise<ExternalVideo | null> {
  let raw = input.trim();
  if (!raw) return null;

  let bvid: string | undefined;
  let aid: number | undefined;
  let p: number | undefined;

  // b23.tv 短链：跟随重定向拿到真实链接后再解析 BV
  if (/^https?:\/\/b23\.tv\//i.test(raw) || /^b23\.tv\//i.test(raw)) {
    try {
      const full = raw.startsWith("http") ? raw : `https://${raw}`;
      const res = await fetch(full, {
        method: "HEAD",
        redirect: "follow",
        credentials: "omit",
      });
      raw = res.url || raw;
    } catch {
      /* 短链解析失败则按原始输入继续 */
    }
  }

  const urlMatch = raw.match(BILIBILI_URL_RE);
  if (urlMatch) {
    if (urlMatch[1]) bvid = urlMatch[1];
    else if (urlMatch[2]) aid = Number.parseInt(urlMatch[2], 10) || undefined;

    const pMatch = raw.match(/[?&]p=(\d+)/);
    if (pMatch?.[1]) {
      const parsedP = Number.parseInt(pMatch[1], 10);
      if (parsedP > 0) p = parsedP;
    }
  }

  if (!bvid && !aid) {
    const bvidMatch = raw.match(BVID_RE);
    if (bvidMatch) {
      bvid = bvidMatch[0];
    } else {
      const avidMatch = raw.match(AVID_RE);
      if (avidMatch?.[1]) aid = Number.parseInt(avidMatch[1], 10) || undefined;
    }
  }

  if (!bvid && !aid) return null;

  return {
    provider: "bilibili",
    bvid: bvid ?? null,
    aid: aid ?? null,
    p: p ?? null,
    page: p ?? null,
    embedUrl: null,
    coverUrl: null,
    title: null,
    duration: null,
  };
}

async function onVideoDialogConfirm(raw: string) {
  const video = await parseBilibiliVideo(raw);
  if (!video) {
    message.error("无法识别该 B 站视频链接，请检查 BV 号或链接格式");
    return;
  }
  if (externalVideos.value.length >= MAX_EXTERNAL_VIDEOS) {
    message.error(`最多只能嵌入 ${MAX_EXTERNAL_VIDEOS} 个视频`);
    return;
  }

  // 尝试拉取视频信息（标题/封面/cid）；失败时仍允许以 bvid 播放
  let info: import("~/types/entities").BilibiliVideoInfo | null = null;
  try {
    info = await api.getBilibiliInfo(video.bvid || undefined, video.aid || undefined);
  } catch {
    info = null;
  }
  if (info?.pic) {
    video.coverUrl = info.pic;
  }
  if (info?.title) video.title = info.title;
  if (typeof info?.duration === 'number') video.duration = info.duration;

  const targetP = video.p && video.p > 0 ? video.p : 1;
  const pageInfo = info?.pages?.find((page) => page.page === targetP);
  const cid = pageInfo?.cid ?? info?.cid;
  video.cid = typeof cid === 'number' ? cid : null;
  video.embedUrl = buildBilibiliEmbedUrl(video.bvid, video.aid, video.cid, video.p);

  externalVideos.value.push(video);
  isVideoDialogVisible.value = false;
  markDirty();
}

function openVideoDialog() {
  if (uploadTasks.value.length > 0) {
    message.error("已上传图片的帖子不能再添加视频");
    return;
  }
  isVideoDialogVisible.value = true;
}

function removeExternalVideo(index: number) {
  externalVideos.value.splice(index, 1);
  markDirty();
}

function handleVideoCoverError(event: Event, video: ExternalVideo) {
  video.coverLoadError = true;
  const target = event.target as HTMLImageElement | null;
  if (target) target.style.display = "none";
}

/* ── Helpers ──────────────────────────────────────── */
function buildSnapshot(): string {
  return JSON.stringify({
    title: title.value.trim(),
    text: body.value.trim(),
    externalVideos: externalVideos.value,
    cover: coverPayload.value,
    category: selectedCategory.value,
  });
}

function syncSnapshot() {
  lastSavedSnapshot.value = buildSnapshot();
  hasUnsavedChanges.value = false;
  lastSavedAt.value = new Date();
}



/* ── Auto-save ────────────────────────────────────── */
const performSaveDraft = async (force = false) => {
  if (!auth.isLogin) return;
  if (isSavingDraft.value && !force) return;
  if (!documentId.value && !hasAnyContent.value) return;

  const snapshot = buildSnapshot();
  if (!force && snapshot === lastSavedSnapshot.value) return;

  isSavingDraft.value = true;

  try {
    const authorId = auth.user?.authorId || auth.user?.documentId;
    const payload = {
      title: title.value.trim(),
      text: body.value.trim(),
      externalVideos: externalVideos.value,
      coverId: coverPayload.value,
      authorId: authorId || undefined,
      isAnonymous: isAnonymous.value || undefined,
      category: selectedCategory.value || DEFAULT_CATEGORY_SLUG,
    };

    let result: DraftArticle;
    const isCreate = !documentId.value;
    if (isCreate) {
      result = await api.createArticleDraft(payload);
    } else {
      result = await api.updateArticleDraft(documentId.value!, payload);
    }

    if (result.documentId) {
      documentId.value = result.documentId;
    }

    // 同步左侧草稿列表（已发布帖子的 draft 版本不进草稿箱）
    if (result.documentId && !isEditingPublished.value) {
      const idx = drafts.value.findIndex(
        (d) => d.documentId === result.documentId,
      );
      if (idx === -1) {
        drafts.value.unshift(result);
      } else {
        drafts.value[idx] = { ...drafts.value[idx], ...result };
      }
    }

    syncSnapshot();
  } catch (err) {
    hasUnsavedChanges.value = true;
    if (force) throw err;
    message.error(resolveErrorMessage(err, "草稿保存失败"));
  } finally {
    isSavingDraft.value = false;
  }
};

const debouncedSave = useDebounceFn(() => {
  performSaveDraft().catch(() => undefined);
}, AUTO_SAVE_DELAY);

function markDirty() {
  if (suppressTracking.value) return;
  hasUnsavedChanges.value = true;
  debouncedSave();
}

// ── 编辑器增强：保存状态 / Markdown 插入 / 实时预览 ──
const saveStatusText = computed(() => {
  if (isSavingDraft.value) return "保存中…";
  if (hasUnsavedChanges.value) return "有未保存修改";
  if (documentId.value) {
    return lastSavedAt.value
      ? `已保存 ${lastSavedAt.value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
      : "已保存";
  }
  return "";
});

const bodyPreviewHtml = computed(() => {
  try {
    return formatBodyText(body.value);
  } catch {
    return "";
  }
});

function insertMarkdown(prefix: string, suffix = prefix) {
  const ta = bodyTextareaRef.value?.$el?.querySelector("textarea") as HTMLTextAreaElement | null;
  const start = ta ? ta.selectionStart : body.value.length;
  const end = ta ? ta.selectionEnd : body.value.length;
  const selected = body.value.slice(start, end);
  const replacement = prefix + selected + suffix;
  body.value = body.value.slice(0, start) + replacement + body.value.slice(end);
  nextTick(() => {
    if (ta) {
      ta.focus();
      const pos = start + prefix.length + selected.length;
      ta.setSelectionRange(pos, pos);
    }
  });
  markDirty();
}

/* ── Image Upload ─────────────────────────────────── */
function createUploadTask(file: File): UploadTask {
  return {
    localId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    filename: file.name,
    file,
    status: "pending" as UploadStatus,
    progress: 0,
    previewUrl: URL.createObjectURL(file),
  };
}

function createReferencedUploadTask(upload: UploadedFile): UploadTask {
  const filename = upload.name || upload.url.split("/").pop() || "image";
  return {
    localId: `referenced_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    filename,
    file: new File([], filename),
    status: "done" as UploadStatus,
    progress: 100,
    previewUrl: upload.url,
    serverId: upload.documentId,
    serverUrl: upload.url,
    nsfwStatus: upload.nsfwStatus,
  };
}

function openImagePicker() {
  if (!auth.isLogin) {
    loginDialog.open();
    return;
  }
  if (externalVideos.value.length > 0) {
    message.error("已添加视频，不能再上传图片");
    return;
  }
  if (remainingCoverSlots.value <= 0) {
    message.error(`帖子最多上传 ${maxCoverImages} 张图片`);
    return;
  }
  showImagePickerModal.value = true;
}

function handleImagePickerUpload(files: File[]) {
  if (externalVideos.value.length > 0) {
    message.error("已添加视频，不能再上传图片");
    return;
  }
  handleFileSelect(files);
}

function handleImagePickerSelect(uploads: UploadedFile[]) {
  if (externalVideos.value.length > 0) {
    message.error("已添加视频，不能再上传图片");
    return;
  }
  const existing = new Set(existingUploadIds.value);
  const remaining = remainingCoverSlots.value;
  const available = uploads
    .filter((upload) => upload.documentId && upload.url && !existing.has(upload.documentId))
    .slice(0, remaining);

  if (!available.length) {
    message.warning("没有可添加的图片");
    return;
  }

  for (const upload of available) {
    uploadTasks.value.push(createReferencedUploadTask(upload));
  }
  markDirty();
}

function handleImagePickerDelete(upload: UploadedFile) {
  if (!upload.documentId) return;
  const index = uploadTasks.value.findIndex((task) => task.serverId === upload.documentId);
  if (index !== -1) removeUpload(index);
}

async function executeUploadTask(task: UploadTask) {
  try {
    task.status = "uploading";
    task.progress = 0;

    const uploaded = await api.uploadImage(task.file, (percent) => {
      task.progress = percent;
    });

    task.serverId = uploaded.documentId;
    task.serverUrl = uploaded.url;
    task.nsfwStatus = uploaded.nsfwStatus;
    task.status = "done";
    task.progress = 100;
    markDirty();
  } catch (err) {
    task.status = "error";
    task.error = resolveErrorMessage(err, "上传失败");
  }
}

function handleFileSelect(files: FileList | File[]) {
  if (externalVideos.value.length > 0) {
    message.error("已添加视频，不能再上传图片");
    return;
  }
  const fileArray = Array.from(files);
  const remaining = maxCoverImages - uploadTasks.value.length;

  if (remaining <= 0) {
    message.error(`帖子最多上传 ${maxCoverImages} 张图片`);
    return;
  }

  const valid = fileArray.filter((f) => {
    if (!isAllowedImage(f.name)) {
      message.error("仅支持 JPG、PNG、GIF、WEBP、AVIF 格式");
      return false;
    }
    if (f.size > MAX_IMAGE_SIZE) {
      message.error(`图片 ${f.name} 超过 30MB`);
      return false;
    }
    return true;
  });

  const toUpload = valid.slice(0, remaining);
  for (const file of toUpload) {
    const task = createUploadTask(file);
    uploadTasks.value.push(task);
    // ⚠️ push 进 reactive 数组后，task 的原始引用不再受 Proxy 拦截，
    // 必须取出代理后的元素，否则上传过程中 progress/status 的更新无法触发渲染。
    const reactiveTask = uploadTasks.value[uploadTasks.value.length - 1]!;
    executeUploadTask(reactiveTask);
  }
}

function retryUpload(task: UploadTask) {
  if (task.status !== "error") return;
  task.status = "pending";
  task.error = undefined;
  task.progress = 0;
  executeUploadTask(task);
}

function removeUpload(index: number) {
  const task = uploadTasks.value[index];
  if (task) {
    URL.revokeObjectURL(task.previewUrl);
    uploadTasks.value.splice(index, 1);
    markDirty();
  }
}

function onCoverFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    handleFileSelect(input.files);
    input.value = "";
  }
}

/* ── Publish ──────────────────────────────────────── */
async function publish() {
  if (!canPublish.value) return;

  if (!auth.isLogin) {
    loginDialog.open();
    return;
  }

  if (title.value.trim().length === 0) {
    message.error("标题不能为空");
    return;
  }

  if (isBodyOverLimit.value) {
    message.error(`正文最多 ${maxBodyChars} 字`);
    return;
  }

  isPublishing.value = true;

  try {
    await performSaveDraft(true);

    if (!documentId.value) {
      throw new Error("草稿保存后仍缺少 documentId");
    }

    const res = await api.publishArticleDraft(documentId.value);
    const publishedStatus = (res as { status?: string } | undefined)?.status;

    // 站点开启「新帖需审核」：发布进入待审队列，不进信息流
    if (publishedStatus === "pending") {
      message.success("已提交审核，请等待管理员审核");
      router.replace("/");
      return;
    }

    if (isEditingPublished.value) {
      // 编辑重发：回到帖子详情页查看更新后的内容。
      const editedId = documentId.value;
      message.success("帖子已更新");
      router.replace(`/post/${editedId}`);
      return;
    }

    // 乐观插入：fire-and-forget 拉取刚发布的帖子详情塞进 pending 队列，
    // 不阻塞跳转——usePendingPost 是响应式 ref，首页 watch 队列即可消费
    // 迟到的 push（可能晚于 onMounted 才到达）。拉取失败时首页正常列表加载兜底。
    const draftId = documentId.value;
    api.getPost(draftId).then(
      (post) => pendingPost.push(post),
      () => undefined,
    );

    router.replace("/");
  } catch (err) {
    message.error(resolveErrorMessage(err, isEditingPublished.value ? "更新失败" : "发布失败"));
  } finally {
    isPublishing.value = false;
  }
}

/* ── Discard changes (editing published post) ───── */
async function discardChanges() {
  if (!documentId.value || !isEditingPublished.value) return;
  const ok = await confirmDialog.open({
    title: "放弃修改",
    message: "确定放弃未发布的修改吗？内容将恢复为线上版本。",
    confirmText: "放弃修改",
    danger: true,
  });
  if (!ok) return;

  isDiscardingChanges.value = true;
  try {
    await api.discardArticleDraft(documentId.value);
    const detail = await api.getMyDraftDetail(documentId.value);
    applyDraftToEditor(detail);
    message.success("已恢复为线上版本");
  } catch (err) {
    message.error(resolveErrorMessage(err, "放弃修改失败"));
  } finally {
    isDiscardingChanges.value = false;
  }
}

/* ── Delete Draft ─────────────────────────────────── */
async function deleteDraft() {
  if (!documentId.value) return;
  const ok = await confirmDialog.open({ title: "删除草稿", message: "确定要删除这个草稿吗？此操作不可恢复。", confirmText: "删除", danger: true });
  if (!ok) return;

  isDeletingDraft.value = true;

  try {
    await api.deleteArticle(documentId.value);
    resetEditor();
    await refreshDrafts();
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除草稿失败"));
  } finally {
    isDeletingDraft.value = false;
  }
}

/* ── Draft List Helpers ───────────────────────────── */
/** 删除草稿列表中的指定草稿（不切换当前选中项） */
async function deleteDraftItem(draftId: string) {
  const ok = await confirmDialog.open({ title: "删除草稿", message: "确定要删除这个草稿吗？此操作不可恢复。", confirmText: "删除", danger: true });
  if (!ok) return;
  await api.deleteArticle(draftId);
  if (documentId.value === draftId) {
    resetEditor();
  }
  await refreshDrafts();
}

function isDraftActive(draft: DraftArticle): boolean {
  return !!documentId.value && draft.documentId === documentId.value;
}

function draftPreviewText(draft: DraftArticle): string {
  const txt = (draft.text || "").trim();
  return txt ? txt.slice(0, 40) : "无内容";
}

const editorWordCount = computed(() => body.value.length);
const editorTitleCount = computed(() => title.value.length);

const EDITING_KEY = "__editing__";
const activeMenuKey = computed<string>(
  () => (isEditingPublished.value ? EDITING_KEY : documentId.value || EDITING_KEY),
);

/* ── Mobile sheet handlers ────────────────────────── */
function openMobileCoverPicker() {
  openImagePicker();
}

function onMobileNewDraft() {
  isMobileDraftsOpen.value = false;
  if (documentId.value) newDraft();
}

function onMobileSelectDraft(draft: DraftArticle) {
  isMobileDraftsOpen.value = false;
  if (draft.documentId === documentId.value) return;
  onMenuChange(draft.documentId);
}

async function onMobileDeleteDraft() {
  isMobileSettingsOpen.value = false;
  await deleteDraft();
}

async function onMobileDiscardChanges() {
  isMobileSettingsOpen.value = false;
  await discardChanges();
}

function onMobileSelectCategory(slug: string) {
  selectCategory(slug);
  isMobileCategoryOpen.value = false;
}

function onMenuChange(name: string | number) {
  const key = String(name);
  if (key === EDITING_KEY) {
    // 编辑已发布帖子时该项即当前项，点击不应重置编辑器
    if (documentId.value && !isEditingPublished.value) newDraft();
    return;
  }
  const draft = drafts.value.find((d) => d.documentId === key);
  if (draft && draft.documentId !== documentId.value) {
    openDraft(draft);
  }
}

/* ── Draft List ───────────────────────────────────── */
async function loadMoreDrafts() {
  if (!auth.isLogin || draftsLoading.value || !draftsHasNext.value) return;

  draftsLoading.value = true;
  try {
    const page: Pagination<DraftArticle> = await api.getMyDrafts(
      draftsCursor.value,
    );
    drafts.value.push(...page.nodes);
    draftsCursor.value = page.endCursor;
    draftsHasNext.value = page.hasNextPage;
  } catch (err) {
    message.error(resolveErrorMessage(err, "加载草稿失败"));
  } finally {
    draftsLoading.value = false;
  }
}

async function refreshDrafts() {
  drafts.value = [];
  draftsCursor.value = "";
  draftsHasNext.value = true;
  draftsInitialized.value = true;
  await loadMoreDrafts();
}

async function ensureDraftsLoaded() {
  if (draftsInitialized.value || draftsLoading.value) return;
  await refreshDrafts();
}

async function openDraft(draft: DraftArticle) {
  if (draft.documentId === documentId.value) {
    return;
  }

  if (hasUnsavedChanges.value && (documentId.value || hasAnyContent.value)) {
    try {
      await performSaveDraft(true);
    } catch {
      /* best effort */
    }
  }

  try {
    const detail = await api.getMyDraftDetail(draft.documentId);
    applyDraftToEditor(detail);
  } catch (err) {
    message.error(resolveErrorMessage(err, "加载草稿详情失败"));
  }
}

/* ── Editor State Management ──────────────────────── */
function applyDraftToEditor(draft: DraftArticle) {
  suppressTracking.value = true;
  try {
    documentId.value = draft.documentId;
    isEditingPublished.value = !!draft.hasPublishedVersion;
    title.value = draft.title;
    body.value = draft.text;
    externalVideos.value = draft.externalVideos ?? [];
    isAnonymous.value = !!draft.isAnonymous;
    selectedCategory.value = draft.category?.slug || DEFAULT_CATEGORY_SLUG;

    for (const task of uploadTasks.value) {
      URL.revokeObjectURL(task.previewUrl);
    }
    uploadTasks.value = [];

    if (draft.cover) {
      for (const cover of draft.cover) {
        uploadTasks.value.push({
          localId: `restored_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          filename: cover.url.split("/").pop() || "image",
          file: new File([], "placeholder"),
          status: "done",
          progress: 100,
          previewUrl: cover.url,
          serverId: cover.documentId || "",
          serverUrl: cover.url,
        });
      }
    }

    syncSnapshot();
  } finally {
    suppressTracking.value = false;
  }
}

function resetEditor() {
  suppressTracking.value = true;
  try {
    documentId.value = null;
    title.value = "";
    body.value = "";
    externalVideos.value = [];
    for (const task of uploadTasks.value) {
      URL.revokeObjectURL(task.previewUrl);
    }
    uploadTasks.value = [];
    isAnonymous.value = false;
    isEditingPublished.value = false;
    selectedCategory.value = DEFAULT_CATEGORY_SLUG;
    lastSavedSnapshot.value = "";
    hasUnsavedChanges.value = false;
  } finally {
    suppressTracking.value = false;
  }
}

async function newDraft() {
  if (hasUnsavedChanges.value && (documentId.value || hasAnyContent.value)) {
    try {
      await performSaveDraft(true);
    } catch {
      /* best effort */
    }
  }
  resetEditor();
}

/* ── Drag & Drop ──────────────────────────────────── */
const isDragging = ref(false);
let dragCounter = 0;
// 内部缩略图排序状态
const draggingIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function isFileDrag(e: DragEvent): boolean {
  // 区分外部文件拖入（dataTransfer.types 含 'Files'）与页面内拖拽
  const types = e.dataTransfer?.types;
  if (!types) return false;
  // types 在不同浏览器是 DOMStringList 或数组，统一为数组判断
  return Array.from(types as ArrayLike<string>).includes("Files");
}

function onDragEnter(e: DragEvent) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragCounter++;
  isDragging.value = true;
}
function onDragOver(e: DragEvent) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
}
function onDragLeave(e: DragEvent) {
  if (!isFileDrag(e)) return;
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragging.value = false;
  }
}
function onDrop(e: DragEvent) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragCounter = 0;
  isDragging.value = false;
  if (e.dataTransfer?.files?.length) {
    handleFileSelect(e.dataTransfer.files);
  }
}

/* ── Cover preview (lightGallery, done tasks only) ── */
const { openGallery: openLightGallery, preload: preloadGallery } = useLightGallery();

function openCoverPreview(index: number) {
  const task = uploadTasks.value[index];
  if (!task || task.status !== "done") return;
  // 仅收集已上传完成的图，保持当前显示顺序
  const doneTasks = uploadTasks.value.filter((t) => t.status === "done");
  if (!doneTasks.length) return;
  const images = doneTasks.map((t) => ({ src: t.serverUrl || t.previewUrl }));
  const currentIndex = doneTasks.findIndex((t) => t.localId === task.localId);
  openLightGallery(images, currentIndex >= 0 ? currentIndex : 0);
}

/* ── Cover thumbnail reorder (drag inside grid) ──── */
function onThumbDragStart(e: DragEvent, index: number) {
  const task = uploadTasks.value[index];
  // 仅允许已上传完成的图片参与排序
  if (!task || task.status !== "done") {
    e.preventDefault();
    return;
  }
  draggingIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    // 标记为内部拖拽载荷（与外部 'Files' 拖拽互斥）
    e.dataTransfer.setData("application/x-cover-index", String(index));
  }
}

function onThumbDragOver(e: DragEvent, index: number) {
  if (draggingIndex.value === null) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  if (dragOverIndex.value !== index) dragOverIndex.value = index;
}

function onThumbDrop(e: DragEvent, index: number) {
  if (draggingIndex.value === null) return;
  e.preventDefault();
  e.stopPropagation();
  const from = draggingIndex.value;
  const to = index;
  draggingIndex.value = null;
  dragOverIndex.value = null;
  if (from === to) return;
  const target = uploadTasks.value[to];
  // 排序的目标位置必须也是已上传完成的图片，避免穿插到上传中/失败的项
  if (!target || target.status !== "done") return;
  const arr = uploadTasks.value;
  const [moved] = arr.splice(from, 1);
  if (moved) arr.splice(to, 0, moved);
  markDirty();
}

function onThumbDragEnd() {
  draggingIndex.value = null;
  dragOverIndex.value = null;
}

/* ── Lifecycle ────────────────────────────────────── */
onBeforeUnmount(() => {
  if (hasUnsavedChanges.value && (documentId.value || hasAnyContent.value)) {
    performSaveDraft(true).catch(() => undefined);
  }
  for (const task of uploadTasks.value) {
    URL.revokeObjectURL(task.previewUrl);
  }
});

watch(title, () => markDirty());
watch(body, () => markDirty());

function selectCategory(slug: string) {
  if (!slug || slug === selectedCategory.value) return;
  selectedCategory.value = slug;
  markDirty();
}

/** 标签「全部」下拉选中 */
function onTagDropdownSelect(slug: string) {
  selectCategory(slug);
}

async function loadCategories() {
  try {
    const list = await api.getCategories();
    if (list.length) {
      categories.value = list;
      // 默认选中无效（如默认分类被下架，或非管理员落在仅管理员分区）时
      // 回落到可见列表首项，保证发布帖子必选且不会停留在不可发布帖子的分区。
      const selectable = visibleCategories.value;
      if (selectable.length && !selectable.some((c) => c.slug === selectedCategory.value)) {
        selectedCategory.value = selectable[0]!.slug;
      }
    }
  } catch {
    // 拉取失败不阻塞发布帖子：仍以默认分类兜底（后端同样会兜底「综合」）。
  } finally {
    categoriesLoading.value = false;
  }
}

/* ── Edit mode entry (?edit=<documentId>) ──────── */
async function loadEditTarget(id: string) {
  try {
    const detail = await api.getMyDraftDetail(id);
    applyDraftToEditor(detail);
  } catch (err) {
    message.error(resolveErrorMessage(err, "加载帖子失败"));
  }
}

if (import.meta.client && auth.isLogin) {
  ensureDraftsLoaded();
  const editId = route.query.edit;
  if (typeof editId === "string" && editId) {
    loadEditTarget(editId);
  }
}
if (import.meta.client) {
  loadCategories();
}
</script>

<template>
  <section class="ik-create-page" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- Drag overlay -->
    <Transition name="ik-fade">
      <div v-if="isDragging" class="ik-create-drop-overlay">
        <div class="ik-create-drop-overlay__inner">
          <ArrowUpTrayIcon style="width:48px;height:48px;color:#BFFF09" />
          <span class="ik-create-drop-overlay__text">释放以上传图片</span>
        </div>
      </div>
    </Transition>

    <!-- Hidden file input -->
    <input
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
      multiple
      hidden
      @change="onCoverFileInput"
    />

    <!-- ── Three-Column Body ─────────────────── -->
    <div class="ik-create-columns">
      <!-- ── Left: Sidebar (Drafts) — desktop only ── -->
      <aside class="ik-create-sidebar">
        <z-menu
          class="ik-create-menu"
          :model-value="activeMenuKey"
          @change="onMenuChange"
        >
          <z-menu-item :name="EDITING_KEY">
            <div class="ik-nav-item__content">
              <span class="ik-nav-item__title">
                <span class="ik-nav-item__editing-arrow">▶</span>
                {{ isEditingPublished ? (title.trim() || "编辑帖子") : documentId ? "编辑新帖子" : (title.trim() || "编辑帖子") }}
              </span>
              <span v-if="isEditingPublished" class="ik-nav-item__meta">正在编辑已发布的帖子</span>
              <span v-else-if="documentId" class="ik-nav-item__meta">点击开始编辑新帖子</span>
            </div>
          </z-menu-item>
          <z-menu-item
            v-for="draft in drafts"
            :key="draft.documentId"
            :name="draft.documentId"
          >
            <div class="ik-nav-item__content">
              <span class="ik-nav-item__title">{{ draft.title || "无标题" }}</span>
              <span class="ik-nav-item__meta">{{ draftPreviewText(draft) }}</span>
            </div>
          </z-menu-item>
        </z-menu>
        <div v-if="!auth.isLogin" class="ik-nav-empty">请先登录</div>
        <div v-else-if="draftsLoading && !drafts.length" class="ik-nav-empty">
          <span class="ik-status ik-status--saving">
            <span class="ik-status__dot"></span>加载中
          </span>
        </div>
        <button
          v-if="auth.isLogin && draftsHasNext && drafts.length"
          class="ik-nav-loadmore"
          :disabled="draftsLoading"
          @click="loadMoreDrafts"
        >
          {{ draftsLoading ? "加载中..." : "加载更多" }}
        </button>
      </aside>

      <!-- ── Center: Editor ───────────────────── -->
      <main class="ik-create-editor">
        <div class="ik-create-editor__inner">
          <!-- Title -->
          <div class="ik-create-section ik-create-section--title">
            <ZTextarea
              v-model="title"
              class="ik-create-title-input"
              placeholder="请输入标题"
              rows="1"
              maxlength="200"
            />
            <span class="ik-create-section__count">{{ editorTitleCount }}/200</span>
          </div>

          <!-- Body -->
          <div class="ik-create-section ik-create-section--body">
            <div class="ik-create-editor-frame">
              <div class="ik-create-editor-toolbar">
                <div class="ik-create-editor-mode">
                  <button type="button" :class="{ 'is-active': bodyMode === 'edit' }" @click="bodyMode = 'edit'">编辑</button>
                  <button type="button" :class="{ 'is-active': bodyMode === 'preview' }" @click="bodyMode = 'preview'">预览</button>
                </div>
                <div v-if="bodyMode === 'edit'" class="ik-create-editor-md">
                  <button type="button" title="加粗" @click="insertMarkdown('**', '**')"><b>B</b></button>
                  <button type="button" title="斜体" @click="insertMarkdown('*', '*')"><i>I</i></button>
                  <button type="button" title="链接" @click="insertMarkdown('[', '](https://)')">链接</button>
                  <button type="button" title="引用" @click="insertMarkdown('> ')">引用</button>
                  <button type="button" title="行内代码" @click="insertMarkdown('`', '`')">&lt;/&gt;</button>
                  <button type="button" title="列表项" @click="insertMarkdown('- ')">列表</button>
                  <span class="ik-create-editor-md__sep"></span>
                  <button type="button" title="标题" @click="insertMarkdown('## ')">H2</button>
                  <button type="button" title="分割线" @click="insertMarkdown('\n---\n')">—</button>
                  <button type="button" title="插入图片" @click="openImagePicker()">图片</button>
                </div>
              </div>
              <ZTextarea
                v-if="bodyMode === 'edit'"
                ref="bodyTextareaRef"
                v-model="body"
                class="ik-create-editor__body"
                placeholder="请尽情发挥吧..."
              />
              <div v-else class="ik-create-preview ik-scrollable" v-html="bodyPreviewHtml"></div>
            </div>
          </div>
        </div>

        <!-- Floating indicators -->
        <div class="ik-create-editor__foot">
          <span v-if="saveStatusText" class="ik-create-save-status">
            <span v-if="isSavingDraft" class="ik-save-spinner" aria-hidden="true"></span>
            {{ saveStatusText }}
          </span>
          <span v-else></span>
          <span
            class="ik-create-word-count"
            :class="{ 'ik-create-word-count--over': isBodyOverLimit }"
          >{{ bodyCharCount }}/{{ maxBodyChars }}</span>
        </div>
      </main>

      <!-- ── Right: Settings Panel ────────────── -->
      <aside class="ik-create-settings">
        <div class="ik-create-settings__scroll ik-scrollable">
          <!-- Tags -->
          <div v-if="categoriesLoading || visibleCategories.length" class="ik-create-section">
            <div class="ik-create-section__head">
              <span class="ik-create-section__label">标签</span>
            </div>
            <div class="ik-create-category-chips">
              <template v-if="visibleCategories.length">
                <button
                  v-for="cat in visibleCategories.slice(0, TAG_CHIPS_MAX)"
                  :key="cat.slug"
                  type="button"
                  class="ik-create-category-chip"
                  :class="{ 'ik-create-category-chip--active': selectedCategory === cat.slug }"
                  @click="selectCategory(cat.slug)"
                >
                  {{ cat.name }}
                </button>
                <z-dropdown
                  v-if="visibleCategories.length > TAG_CHIPS_MAX"
                  trigger="click"
                  size="small"
                  class="ik-create-tag-more"
                  @command="onTagDropdownSelect"
                >
                  <button
                    type="button"
                    class="ik-create-category-chip ik-create-category-chip--more"
                    :class="{ 'ik-create-category-chip--active': !visibleCategories.slice(0, TAG_CHIPS_MAX).some((c) => c.slug === selectedCategory) }"
                  >
                    全部 <i class="ik-create-tag-more__caret" aria-hidden="true">▾</i>
                  </button>
                  <template #dropdown>
                    <z-dropdown-item
                      v-for="cat in visibleCategories"
                      :key="cat.slug"
                      :command="cat.slug"
                      :class="{ 'is-selected': selectedCategory === cat.slug }"
                    >{{ cat.name }}</z-dropdown-item>
                  </template>
                </z-dropdown>
              </template>
              <template v-else>
                <span
                  v-for="n in 4"
                  :key="`cat-skeleton-${n}`"
                  class="ik-create-category-chip ik-create-category-chip--placeholder"
                  aria-hidden="true"
                ></span>
              </template>
            </div>
          </div>

          <!-- Media -->
          <div class="ik-create-section">
            <div class="ik-create-section__head">
              <span class="ik-create-section__label">
                <PhotoIcon style="width:14px;height:14px" />
                封面
              </span>
              <span class="ik-create-section__hint">第一张为封面</span>
            </div>
            <div class="ik-cover-grid ik-cover-grid--settings">
              <div
                v-for="(task, idx) in uploadTasks"
                :key="task.localId"
                class="ik-cover-thumb"
                :class="{
                  'ik-cover-thumb--dragging': draggingIndex === idx,
                  'ik-cover-thumb--drag-over': dragOverIndex === idx && draggingIndex !== null && draggingIndex !== idx,
                  'ik-cover-thumb--reorderable': task.status === 'done',
                }"
                :draggable="task.status === 'done'"
                @dragstart="onThumbDragStart($event, idx)"
                @dragover="onThumbDragOver($event, idx)"
                @drop="onThumbDrop($event, idx)"
                @dragend="onThumbDragEnd"
                @mouseenter="task.status === 'done' && preloadGallery()"
                @click="openCoverPreview(idx)"
              >
                <img
                  :src="toThumbUrl(task.previewUrl)"
                  :alt="task.filename"
                  class="ik-cover-thumb__img"
                  decoding="async"
                  draggable="false"
                  @error="($event.target as HTMLImageElement).src = task.previewUrl"
                />
                <span v-if="idx === 0 && task.status === 'done'" class="ik-cover-thumb__cover-badge">封面</span>
                <div v-if="task.status === 'uploading'" class="ik-cover-thumb__overlay">
                  <span class="ik-cover-thumb__pct">{{ task.progress }}%</span>
                  <div class="ik-cover-thumb__bar">
                    <div class="ik-cover-thumb__progress" :style="{ width: task.progress + '%' }"></div>
                  </div>
                </div>
                <div v-else-if="task.status === 'pending'" class="ik-cover-thumb__overlay">
                  <span class="ik-cover-thumb__spinner" aria-hidden="true"></span>
                </div>
                <div
                  v-else-if="task.status === 'error'"
                  class="ik-cover-thumb__overlay ik-cover-thumb__overlay--error"
                  @click.stop="retryUpload(task)"
                >
                  <span class="ik-cover-thumb__error-label">上传失败</span>
                  <span class="ik-cover-thumb__retry">重试</span>
                </div>
                <span v-if="idx === 0" class="ik-cover-thumb__primary">封面</span>
                <button class="ik-cover-thumb__remove" @click.stop.prevent="removeUpload(idx)" aria-label="移除">
                  <XMarkIcon style="width:14px;height:14px" />
                </button>
              </div>
              <div
                v-for="(video, idx) in externalVideos"
                :key="`video-${idx}`"
                class="ik-cover-thumb ik-cover-thumb--video"
              >
                <img
                  v-if="video.coverUrl && !video.coverLoadError"
                  :src="video.coverUrl"
                  :alt="video.title || 'B 站视频'"
                  class="ik-cover-thumb__img"
                  decoding="async"
                  draggable="false"
                  referrerpolicy="no-referrer"
                  @error="handleVideoCoverError($event, video)"
                />
                <div v-if="!video.coverUrl || video.coverLoadError" class="ik-cover-thumb__fallback">
                  <FilmIcon class="ik-cover-thumb__fallback-icon" />
                  <span class="ik-cover-thumb__fallback-text">{{ video.bvid || `av${video.aid}` }}</span>
                </div>
                <div class="ik-cover-thumb__play">
                  <PlayIcon class="ik-cover-thumb__play-icon" />
                </div>
                <button class="ik-cover-thumb__remove" @click.stop.prevent="removeExternalVideo(idx)" aria-label="移除">
                  <XMarkIcon style="width:14px;height:14px" />
                </button>
              </div>
              <CoverImageAddButton
                v-if="uploadTasks.length < maxCoverImages"
                :is-dragging="isDragging"
                :disabled="activeMediaType === 'video' || externalVideos.length > 0"
                @mouseenter="onMediaEnter('image')"
                @mouseleave="onMediaLeave('image')"
                @focus="onMediaEnter('image')"
                @blur="onMediaLeave('image')"
                @click="openImagePicker"
              />
              <CoverVideoAddButton
                v-if="externalVideos.length < MAX_EXTERNAL_VIDEOS && uploadTasks.length === 0"
                :is-dragging="false"
                :disabled="activeMediaType === 'image'"
                @mouseenter="onMediaEnter('video')"
                @mouseleave="onMediaLeave('video')"
                @focus="onMediaEnter('video')"
                @blur="onMediaLeave('video')"
                @click="openVideoDialog"
              />
            </div>
            <BilibiliVideoDialog
              v-model:visible="isVideoDialogVisible"
              @confirm="onVideoDialogConfirm"
              @cancel="isVideoDialogVisible = false"
            />
          </div>

          <!-- Anonymous toggle -->
          <label class="ik-create-anon-toggle" :title="isAnonymous ? '取消匿名发布' : '匿名发布'">
            <EyeSlashIcon style="width:16px;height:16px;color:#9a9a9a" />
            <span>匿名发布</span>
            <z-switch v-model="isAnonymous" @change="markDirty()" />
          </label>
        </div>

        <!-- Sticky action buttons -->
        <div class="ik-create-settings__actions">
          <z-button
            v-if="documentId && isEditingPublished"
            class="ik-create-delete"
            :loading="isDiscardingChanges"
            :disabled="isDiscardingChanges"
            @click="discardChanges"
          >
            放弃修改
          </z-button>
          <z-button
            v-else-if="documentId"
            class="ik-create-delete"
            :loading="isDeletingDraft"
            :disabled="isDeletingDraft"
            @click="deleteDraft"
          >
            删除草稿
          </z-button>
          <z-button
            class="ik-create-publish"
            :type="canPublish ? undefined : 'primary'"
            :loading="isPublishing"
            :disabled="!canPublish"
            @click="publish"
          >
            {{ isPublishing ? (isEditingPublished ? "更新中..." : "发布中...") : isEditingPublished ? "更新帖子" : "发布帖子" }}
          </z-button>
        </div>
      </aside>
    </div>

    <!-- ── Mobile Bottom Bar — tablet + mobile ── -->
    <div class="ik-create-mobile-bar">
      <button
        v-if="auth.isLogin"
        type="button"
        class="ik-create-mobile-bar__drafts"
        aria-label="打开草稿箱"
        @click="isMobileDraftsOpen = true"
      >
        <RectangleStackIcon class="ik-create-mobile-bar__drafts-icon" />
        <span v-if="drafts.length" class="ik-create-mobile-bar__drafts-count">
          {{ drafts.length }}
        </span>
      </button>
      <button
        type="button"
        class="ik-create-mobile-bar__publish"
        :class="{ 'is-disabled': !canPublish }"
        :disabled="!canPublish"
        @click="publish"
      >
        <span v-if="isPublishing" class="ik-create-mobile-bar__spinner" aria-hidden="true"></span>
        {{ isPublishing ? (isEditingPublished ? "更新中..." : "发布中...") : isSavingDraft ? "正在保存" : isEditingPublished ? "更新" : "发布" }}
      </button>
    </div>

    <!-- ═══ Mobile-only: Cover strip + Editor + Settings rows ═══ -->
    <div class="ik-create-mobile-sections">
      <div class="ik-mobile-cover-strip">
        <button
          v-if="uploadTasks.length < maxCoverImages"
          type="button"
          class="ik-mobile-cover-add"
          aria-label="添加图片"
          :disabled="activeMediaType === 'video' || externalVideos.length > 0"
          @mouseenter="onMediaEnter('image')"
          @mouseleave="onMediaLeave('image')"
          @focus="onMediaEnter('image')"
          @blur="onMediaLeave('image')"
          @click="openImagePicker"
        >
          <PhotoIcon class="ik-mobile-cover-add__icon" />
        </button>
        <button
          v-if="externalVideos.length < MAX_EXTERNAL_VIDEOS && uploadTasks.length === 0"
          type="button"
          class="ik-mobile-cover-add"
          aria-label="添加视频"
          :disabled="activeMediaType === 'image'"
          @mouseenter="onMediaEnter('video')"
          @mouseleave="onMediaLeave('video')"
          @focus="onMediaEnter('video')"
          @blur="onMediaLeave('video')"
          @click="openVideoDialog"
        >
          <FilmIcon class="ik-mobile-cover-add__icon" />
        </button>
        <div
          v-for="(task, idx) in uploadTasks"
          :key="task.localId"
          class="ik-mobile-cover-tile"
          @click="task.status === 'done' && openCoverPreview(idx)"
        >
          <img
            :src="toThumbUrl(task.previewUrl)"
            :alt="task.filename"
            class="ik-mobile-cover-tile__img"
            decoding="async"
            draggable="false"
            @error="($event.target as HTMLImageElement).src = task.previewUrl"
          />
          <div v-if="task.status === 'uploading'" class="ik-mobile-cover-tile__overlay">
            <span class="ik-mobile-cover-tile__pct">{{ task.progress }}%</span>
          </div>
          <div v-else-if="task.status === 'pending'" class="ik-mobile-cover-tile__overlay">
            <span class="ik-mobile-cover-tile__spinner" aria-hidden="true"></span>
          </div>
          <div v-else-if="task.status === 'error'" class="ik-mobile-cover-tile__overlay">
            <button type="button" class="ik-mobile-cover-tile__retry" @click.stop="retryUpload(task)">重试</button>
          </div>
          <span v-if="idx === 0" class="ik-mobile-cover-tile__primary">封面</span>
          <button type="button" class="ik-mobile-cover-tile__remove" aria-label="移除" @click.stop.prevent="removeUpload(idx)">
            <XMarkIcon style="width:12px;height:12px" />
          </button>
        </div>
        <div
          v-for="(video, idx) in externalVideos"
          :key="`mobile-video-${idx}`"
          class="ik-mobile-cover-tile ik-mobile-cover-tile--video"
        >
          <img
            v-if="video.coverUrl && !video.coverLoadError"
            :src="video.coverUrl"
            :alt="video.title || 'B 站视频'"
            class="ik-mobile-cover-tile__img"
            decoding="async"
            draggable="false"
            referrerpolicy="no-referrer"
            @error="handleVideoCoverError($event, video)"
          />
          <div v-if="!video.coverUrl || video.coverLoadError" class="ik-mobile-cover-tile__fallback">
            <FilmIcon class="ik-mobile-cover-tile__fallback-icon" />
            <span class="ik-mobile-cover-tile__fallback-text">{{ video.bvid || `av${video.aid}` }}</span>
          </div>
          <div class="ik-mobile-cover-tile__play">
            <PlayIcon class="ik-mobile-cover-tile__play-icon" />
          </div>
          <button type="button" class="ik-mobile-cover-tile__remove" aria-label="移除" @click.stop.prevent="removeExternalVideo(idx)">
            <XMarkIcon style="width:12px;height:12px" />
          </button>
        </div>
      </div>

      <!-- Mobile title input -->
      <input
        v-model="title"
        class="ik-mobile-title-input"
        type="text"
        placeholder="请输入标题"
        maxlength="200"
      />

      <div class="ik-mobile-divider"></div>

      <!-- Mobile editor toolbar -->
      <div class="ik-create-editor-toolbar ik-create-editor-toolbar--mobile">
        <div class="ik-create-editor-mode">
          <button type="button" :class="{ 'is-active': bodyMode === 'edit' }" @click="bodyMode = 'edit'">编辑</button>
          <button type="button" :class="{ 'is-active': bodyMode === 'preview' }" @click="bodyMode = 'preview'">预览</button>
        </div>
        <div v-if="bodyMode === 'edit'" class="ik-create-editor-md">
          <button type="button" title="加粗" @click="insertMarkdown('**', '**')"><b>B</b></button>
          <button type="button" title="斜体" @click="insertMarkdown('*', '*')"><i>I</i></button>
          <button type="button" title="链接" @click="insertMarkdown('[', '](https://)')">链接</button>
          <button type="button" title="引用" @click="insertMarkdown('> ')">引用</button>
          <button type="button" title="代码" @click="insertMarkdown('`', '`')">&lt;/&gt;</button>
          <button type="button" title="列表" @click="insertMarkdown('- ')">列表</button>
        </div>
      </div>

      <!-- Mobile body input -->
      <textarea
        v-if="bodyMode === 'edit'"
        v-model="body"
        class="ik-mobile-body-input"
        placeholder="请尽情发挥吧"
        rows="6"
      ></textarea>
      <div v-else class="ik-create-preview ik-scrollable ik-mobile-preview" v-html="bodyPreviewHtml"></div>

      <!-- Mobile word count -->
      <div class="ik-mobile-word-bar">
        <span v-if="saveStatusText" class="ik-create-save-status">
          <span v-if="isSavingDraft" class="ik-save-spinner" aria-hidden="true"></span>
          {{ saveStatusText }}
        </span>
        <span v-else></span>
        <span
          class="ik-create-word-count"
          :class="{ 'ik-create-word-count--over': isBodyOverLimit }"
        >{{ bodyCharCount }}/{{ maxBodyChars }}</span>
      </div>

      <div class="ik-mobile-divider"></div>

      <button type="button" class="ik-mobile-row" @click="isMobileCategoryOpen = true">
        <HashtagIcon class="ik-mobile-row__icon" />
        <span class="ik-mobile-row__title">标签</span>
        <span class="ik-mobile-row__value">{{ selectedCategoryName }}</span>
        <ChevronRightIcon class="ik-mobile-row__chevron" />
      </button>
      <div class="ik-mobile-divider"></div>
      <button type="button" class="ik-mobile-row" @click="openMobileCoverPicker">
        <PhotoIcon class="ik-mobile-row__icon" />
        <span class="ik-mobile-row__title">封面</span>
        <span class="ik-mobile-row__value">{{ uploadTasks.length }}/{{ maxCoverImages }}</span>
        <ChevronRightIcon class="ik-mobile-row__chevron" />
      </button>
      <div class="ik-mobile-divider"></div>
      <button type="button" class="ik-mobile-row" @click="isMobileSettingsOpen = true">
        <Cog6ToothIcon class="ik-mobile-row__icon" />
        <span class="ik-mobile-row__title">帖子设置</span>
        <ChevronRightIcon class="ik-mobile-row__chevron" />
      </button>
    </div>

    <!-- ═══ Mobile Sheets (Teleported) ═══ -->
    <ClientOnly>
      <!-- Drafts Sheet -->
      <Teleport to="body">
        <Transition name="ik-mobile-sheet">
          <div
            v-if="isMobileDraftsOpen"
            class="ik-mobile-sheet"
            role="dialog"
            aria-modal="true"
            @click.self="isMobileDraftsOpen = false"
          >
            <div class="ik-mobile-sheet__panel ik-mobile-sheet__panel--drafts">
              <div class="ik-mobile-sheet__handle"></div>
              <header class="ik-mobile-sheet__header">
                <span class="ik-mobile-sheet__title">草稿箱</span>
                <button type="button" class="ik-mobile-sheet__close" aria-label="关闭" @click="isMobileDraftsOpen = false">
                  <XMarkIcon style="width:20px;height:20px" />
                </button>
              </header>
              <div class="ik-mobile-sheet__body ik-mobile-sheet__body--no-scrollbar">
                <button type="button" class="ik-mobile-draft-row ik-mobile-draft-row--new" :class="{ 'is-active': !documentId }" @click="onMobileNewDraft">
                  <PlusCircleIcon class="ik-mobile-draft-row__icon" />
                  <div class="ik-mobile-draft-row__content">
                    <span class="ik-mobile-draft-row__title">编辑新帖子</span>
                    <span class="ik-mobile-draft-row__meta">{{ documentId ? "点击开始编辑新帖子" : "当前正在编辑" }}</span>
                  </div>
                </button>
                <TransitionGroup name="ik-draft-list">
                  <button
                    v-for="(draft, idx) in drafts"
                    :key="draft.documentId"
                    type="button"
                    class="ik-mobile-draft-row"
                    :class="{ 'is-active': draft.documentId === documentId }"
                    :style="{ transitionDelay: `${idx * 30}ms` }"
                    @click="onMobileSelectDraft(draft)"
                  >
                    <RectangleStackIcon class="ik-mobile-draft-row__icon" />
                    <div class="ik-mobile-draft-row__content">
                      <span class="ik-mobile-draft-row__title">{{ draft.title || "无标题" }}</span>
                      <span class="ik-mobile-draft-row__meta">{{ draftPreviewText(draft) }}</span>
                    </div>
                  </button>
                </TransitionGroup>
                <div v-if="!auth.isLogin" class="ik-mobile-draft-empty">
                  <InboxIcon class="ik-mobile-draft-empty__icon" />
                  <span>请先登录</span>
                </div>
                <div v-else-if="draftsLoading && !drafts.length" class="ik-mobile-draft-empty">
                  <span class="ik-mobile-draft-spinner" aria-hidden="true"></span>
                  <span>加载中...</span>
                </div>
                <div v-else-if="auth.isLogin && !drafts.length && !draftsLoading" class="ik-mobile-draft-empty">
                  <InboxIcon class="ik-mobile-draft-empty__icon" />
                  <span>暂无草稿</span>
                </div>
                <button
                  v-if="auth.isLogin && draftsHasNext && drafts.length"
                  type="button"
                  class="ik-mobile-draft-loadmore"
                  :disabled="draftsLoading"
                  @click="loadMoreDrafts"
                >
                  <span v-if="draftsLoading" class="ik-mobile-draft-spinner ik-mobile-draft-spinner--small" aria-hidden="true"></span>
                  {{ draftsLoading ? "加载中..." : "加载更多" }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Settings Sheet -->
      <Teleport to="body">
        <Transition name="ik-mobile-sheet">
          <div
            v-if="isMobileSettingsOpen"
            class="ik-mobile-sheet"
            role="dialog"
            aria-modal="true"
            @click.self="isMobileSettingsOpen = false"
          >
            <div class="ik-mobile-sheet__panel">
              <div class="ik-mobile-sheet__handle"></div>
              <span class="ik-mobile-sheet__title">帖子设置</span>
              <div class="ik-mobile-sheet__body ik-mobile-sheet__body--compact">
                <label class="ik-mobile-settings-row ik-mobile-settings-row--toggle">
                  <EyeSlashIcon class="ik-mobile-settings-row__icon" />
                  <span class="ik-mobile-settings-row__text">
                    <span class="ik-mobile-settings-row__title">匿名发布</span>
                    <span class="ik-mobile-settings-row__desc">开启后将隐藏你的身份</span>
                  </span>
                  <z-switch v-model="isAnonymous" @change="markDirty()" />
                </label>
                <button
                  v-if="documentId && isEditingPublished"
                  type="button"
                  class="ik-mobile-settings-row ik-mobile-settings-row--danger"
                  :disabled="isDiscardingChanges"
                  @click="onMobileDiscardChanges"
                >
                  <TrashIcon class="ik-mobile-settings-row__icon" />
                  <span class="ik-mobile-settings-row__title">放弃修改</span>
                  <ChevronRightIcon class="ik-mobile-settings-row__chevron" />
                </button>
                <button
                  v-else-if="documentId"
                  type="button"
                  class="ik-mobile-settings-row ik-mobile-settings-row--danger"
                  :disabled="isDeletingDraft"
                  @click="onMobileDeleteDraft"
                >
                  <TrashIcon class="ik-mobile-settings-row__icon" />
                  <span class="ik-mobile-settings-row__title">删除草稿</span>
                  <ChevronRightIcon class="ik-mobile-settings-row__chevron" />
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Category Sheet -->
      <Teleport to="body">
        <Transition name="ik-mobile-sheet">
          <div
            v-if="isMobileCategoryOpen"
            class="ik-mobile-sheet"
            role="dialog"
            aria-modal="true"
            @click.self="isMobileCategoryOpen = false"
          >
            <div class="ik-mobile-sheet__panel">
              <div class="ik-mobile-sheet__handle"></div>
              <span class="ik-mobile-sheet__title">选择分类</span>
              <div class="ik-mobile-sheet__body ik-mobile-sheet__body--compact ik-mobile-cat-grid">
                <button
                  v-for="cat in visibleCategories"
                  :key="cat.slug"
                  type="button"
                  class="ik-mobile-settings-row"
                  :class="{ 'ik-mobile-settings-row--active': selectedCategory === cat.slug }"
                  @click="onMobileSelectCategory(cat.slug)"
                >
                  <span class="ik-mobile-settings-row__title">{{ cat.name }}</span>
                  <CheckIcon v-if="selectedCategory === cat.slug" class="ik-mobile-settings-row__check" />
                </button>
                <div v-if="!visibleCategories.length" class="ik-mobile-draft-empty">
                  {{ categoriesLoading ? "加载中..." : "暂无可选分类" }}
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Image Picker Modal -->
      <Teleport to="body">
        <Transition name="ik-overlay" appear>
          <PostImagePickerModal
            v-if="showImagePickerModal"
            :existing-ids="existingUploadIds"
            :remaining="remainingCoverSlots"
            @close="showImagePickerModal = false"
            @upload="handleImagePickerUpload"
            @select="handleImagePickerSelect"
            @delete="handleImagePickerDelete"
          />
        </Transition>
      </Teleport>
    </ClientOnly>
  </section>
</template>


<style scoped>

/* ═══════════════════════════════════════════════
   Create Post Page – Three-Column Responsive Layout
   ═══════════════════════════════════════════════ */
.ik-create-page {
  position: relative;
  width: min(1440px, calc(100% - 40px));
  margin: 0 auto;
  padding: var(--ik-space-xl) 0 var(--ik-space-2xl);
  height: calc(100vh - 78px);
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-lg);
}

.ik-create-page > .ik-create-columns {
  position: relative;
  z-index: 1;
}

/* ── Drag overlay ──────────────────────────── */
.ik-create-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.ik-create-drop-overlay__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ik-space-lg);
  padding: var(--ik-space-3xl) 64px;
  border: 2px dashed var(--ik-primary);
  border-radius: var(--ik-radius-xl);
  background: rgba(215, 255, 0, 0.04);
}

.ik-create-drop-overlay__text {
  font-size: 18px;
  font-weight: 700;
  color: var(--ik-primary);
  letter-spacing: 0.5px;
}

.ik-fade-enter-active,
.ik-fade-leave-active { transition: opacity 200ms ease; }
.ik-fade-enter-from,
.ik-fade-leave-to { opacity: 0; }

/* ═════════ Three-Column Grid ═════════ */
.ik-create-columns {
  flex: 1;
  display: grid;
  grid-template-columns: 200px 1fr 260px;
  gap: var(--ik-space-lg);
  min-height: 0;
  height: 100%;
  overflow: hidden;
  align-items: stretch;
}

/* ═════════ Left Sidebar (Drafts) ═════════ */
.ik-create-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-sm);
  max-height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.ik-create-sidebar::-webkit-scrollbar {
  display: none;
}

.ik-create-menu {
  flex: 1;
  min-height: 320px !important;
  max-height: 100%;
}

.ik-create-menu :deep(.z-menu__item) {
  position: relative;
  align-items: stretch;
  min-height: 56px;
  padding: 10px 16px;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

/* 约束滚动视图宽度：防止 fit-content 被超长 nowrap 文字撑开导致横向溢出 */
.ik-create-menu :deep(.z-scrollbar__view) {
  width: 100% !important;
  min-width: 0;
}

/* 撤销 wrap 的负 margin 撑宽，使内容严格落在菜单范围内 */
.ik-create-menu :deep(.z-scrollbar__wrap) {
  width: 100%;
  margin-right: 0 !important;
  margin-bottom: 0 !important;
}

.ik-create-menu :deep(.z-menu__content) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 20px 0;
}

.ik-create-menu :deep(.z-menu__item) > * {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.ik-nav-item__content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.ik-nav-item__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ik-text-base);
  font-weight: 900;
  line-height: 1.3;
  letter-spacing: 0.2px;
  min-width: 0;
}

.ik-nav-item__meta {
  font-size: var(--ik-text-xs);
  font-weight: 700;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.ik-create-menu :deep(.z-menu__item.is-active) .ik-nav-item__meta {
  color: rgba(0, 0, 0, 0.6);
  opacity: 1;
}

.ik-nav-item__editing-arrow {
  font-size: 10px;
  margin-right: 4px;
  color: var(--ik-primary);
}

.ik-create-menu :deep(.z-menu__item.is-active) .ik-nav-item__editing-arrow {
  color: #0a0a0a;
}

.ik-nav-loadmore {
  flex-shrink: 0;
  padding: var(--ik-space-sm) 10px;
  border: 1px dashed #2a2a2a;
  border-radius: var(--ik-radius-sm);
  background: transparent;
  color: #888;
  font-size: var(--ik-text-xs);
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 200ms, color 200ms;
}

.ik-nav-loadmore:hover:not(:disabled) {
  border-color: var(--ik-primary);
  color: var(--ik-primary);
}

.ik-nav-loadmore:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ik-nav-empty {
  flex-shrink: 0;
  text-align: center;
  color: #555;
  font-size: var(--ik-text-xs);
  padding: var(--ik-space-md) 0;
}

/* ═════════ Center Editor ═════════ */
.ik-create-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-radius: var(--ik-radius-xl) 0 var(--ik-radius-xl) var(--ik-radius-xl);
  overflow: hidden;
}

.ik-create-editor__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-xl);
  padding: var(--ik-space-xl) 26px var(--ik-space-2xl);
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #0a0a0a 0%, #070707 100%);
  border: 4px solid #000;
  border-radius: 22px 0 22px 22px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #3a3a3a transparent;
}

.ik-create-editor__inner::-webkit-scrollbar {
  width: 3px;
}

.ik-create-editor__inner::-webkit-scrollbar-track {
  background: transparent;
}

.ik-create-editor__inner::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 3px;
}

/* ── Floating foot (save status + word count) ── */
.ik-create-editor__foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ik-space-sm) 26px;
  background: #141414;
  border-top: 1px solid #262626;
  border-radius: 0 0 22px 22px;
}

.ik-create-save-status {
  display: inline-flex;
  align-items: center;
  gap: var(--ik-space-sm);
  font-size: var(--ik-text-xs);
  color: #8a8a8a;
  font-variant-numeric: tabular-nums;
}

.ik-save-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(191, 255, 9, 0.25);
  border-top-color: var(--ik-primary);
  border-radius: 50%;
  animation: ik-save-spin 800ms linear infinite;
  display: inline-block;
}

@keyframes ik-save-spin {
  to { transform: rotate(360deg); }
}

.ik-create-word-count {
  font-size: var(--ik-text-xs);
  font-weight: 700;
  color: #888;
  font-variant-numeric: tabular-nums;
}

.ik-create-word-count--over {
  color: #ff5c5c;
}

/* ═════════ Right Settings Panel ═════════ */
.ik-create-settings {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-radius: var(--ik-radius-xl) 0 var(--ik-radius-xl) var(--ik-radius-xl);
  overflow: hidden;
}

.ik-create-settings__scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-lg);
  padding: var(--ik-space-lg);
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #0a0a0a 0%, #070707 100%);
  border: 4px solid #000;
  border-radius: 22px 0 22px 0;
  overflow-y: auto;
  min-height: 0;
}

.ik-create-settings__actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ik-space-sm);
  padding: var(--ik-space-md);
  background: #141414;
  border-top: 1px solid #262626;
  border-radius: 0 0 22px 22px;
}

/* 覆盖 zzzui 全局 .z-button + .z-button { margin-left: 10px }：
   上下排列的按钮不需要水平左间距 */
.ik-create-settings__actions :deep(.z-button + .z-button) {
  margin-left: 0;
}

.ik-create-delete {
  font-size: var(--ik-text-sm);
  font-weight: 900;
}

.ik-create-delete :deep(.z-button__inner),
.ik-create-delete :deep(button) {
  padding: 10px var(--ik-space-lg);
  font-size: var(--ik-text-sm);
  letter-spacing: 0.5px;
}

.ik-create-publish {
  font-size: var(--ik-text-sm);
  font-weight: 900;
}

.ik-create-publish :deep(.z-button__inner),
.ik-create-publish :deep(button) {
  padding: 10px var(--ik-space-lg);
  font-size: var(--ik-text-sm);
  letter-spacing: 0.5px;
}

/* ═════════ Section (shared) ═════════ */
.ik-create-section {
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-sm);
}

.ik-create-section--title {
  position: relative;
  flex-direction: row;
  align-items: flex-end;
  gap: var(--ik-space-md);
  padding: 4px 2px 14px;
  border-bottom: 1px solid #1f1f1f;
}

.ik-create-section--title:focus-within {
  border-bottom-color: #fbfe00;
}

.ik-create-section--body {
  flex: 1;
  min-height: 0;
}

.ik-create-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ik-space-md);
  padding: 0 2px;
}

.ik-create-section__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ik-space-sm);
  font-size: var(--ik-text-sm);
  font-weight: 900;
  color: #f0f0f0;
  letter-spacing: 0.4px;
}

.ik-create-section__label svg {
  color: var(--ik-primary);
}

.ik-create-section__hint {
  font-size: var(--ik-text-xs);
  font-weight: 700;
  color: #777;
  letter-spacing: 0.2px;
}

.ik-create-section__count {
  flex-shrink: 0;
  font-size: var(--ik-text-xs);
  font-weight: 700;
  color: #888;
  font-variant-numeric: tabular-nums;
  padding-bottom: var(--ik-space-sm);
}

.ik-create-section__count-pill {
  margin-left: 4px;
  padding: 2px var(--ik-space-sm);
  border-radius: var(--ik-radius-pill);
  background: rgba(215, 255, 0, 0.12);
  color: var(--ik-primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;
}

.ik-create-section__count-pill--over {
  background: rgba(255, 68, 68, 0.14);
  color: #ff5c5c;
}

/* ── Title input ───────────────────────────── */
.ik-create-title-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  overflow: visible;
}

.ik-create-title-input :deep(.z-textarea__inner) {
  padding: 6px 0;
  background: transparent;
  color: #fff;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.3px;
  line-height: 1.4;
  border: none;
  resize: none;
}

.ik-create-title-input :deep(.z-textarea__inner)::placeholder {
  color: #4a4a4a;
  font-weight: 700;
  font-style: normal;
}

.ik-create-title-input :deep(.z-textarea__inner):focus {
  outline: none;
  box-shadow: none;
}

.ik-create-title-input::after {
  display: none;
}

/* ── Editor frame ──────────────────────────── */
.ik-create-editor-frame {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--ik-radius-sm);
  background: #050505;
  transition: border-color 220ms, box-shadow 220ms;
  overflow: hidden;
}

.ik-create-editor-frame:focus-within {
  border-color: #fbfe00;
  box-shadow: 0 0 0 1px #fbfe00;
}

.ik-create-editor__body {
  width: 100%;
  min-height: 240px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 15px;
  line-height: 1.75;
  font-family: inherit;
  outline: none;
}

.ik-create-editor__body::after {
  border: none;
  animation: none;
}

.ik-create-editor__body :deep(.z-textarea__inner) {
  padding: 16px;
  color: #e0e0e0;
  resize: vertical;
  background: transparent;
  border: none;
}

.ik-create-editor__body :deep(.z-textarea__inner)::placeholder {
  color: #4a4a4a;
}

.ik-create-editor__body :deep(.z-textarea__inner):focus {
  box-shadow: none;
  outline: none;
}

/* ── Editor toolbar ────────────────────────── */
.ik-create-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #141414;
  border: 1px solid #262626;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
}

.ik-create-editor-mode {
  display: inline-flex;
  gap: 4px;
  background: #1c1c1c;
  border-radius: var(--ik-radius-pill);
  padding: 3px;
}

.ik-create-editor-mode button {
  border: none;
  background: transparent;
  color: #9a9a9a;
  font-size: var(--ik-text-xs);
  padding: 4px 14px;
  border-radius: var(--ik-radius-pill);
  cursor: pointer;
  transition: background 140ms, color 140ms;
}

.ik-create-editor-mode button.is-active {
  background: var(--ik-primary);
  color: #111;
  font-weight: 700;
}

.ik-create-editor-md {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.ik-create-editor-md button {
  border: none;
  background: transparent;
  color: #c8c8c8;
  font-size: var(--ik-text-sm);
  padding: 4px 9px;
  border-radius: var(--ik-radius-sm);
  cursor: pointer;
  transition: background 140ms, color 140ms;
}

.ik-create-editor-md button:hover {
  background: #262626;
  color: var(--ik-primary);
}

.ik-create-editor-md__sep {
  width: 1px;
  height: 16px;
  background: #333;
  margin: 0 4px;
}

.ik-create-preview {
  min-height: 180px;
  padding: 14px 16px;
  font-size: 15px;
  line-height: 1.75;
  color: #d8d8d8;
  background: #0e0e0e;
}

.ik-create-preview :deep(img) {
  max-width: 100%;
  border-radius: var(--ik-radius-sm);
}

.ik-create-preview :deep(pre),
.ik-create-preview :deep(code) {
  background: #1a1a1a;
  border-radius: var(--ik-radius-sm);
}

.ik-create-preview :deep(blockquote) {
  margin: 0;
  padding-left: var(--ik-space-md);
  border-left: 3px solid #333;
  color: #9a9a9a;
}

/* ── Category chips ────────────────────────── */
.ik-create-category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ik-space-sm);
  min-height: 30px;
}

.ik-create-category-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 16px;
  border-radius: var(--ik-radius-pill);
  border: 2px solid #222;
  background: #222222;
  color: #fff;
  font-size: var(--ik-text-base);
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.ik-create-category-chip--active {
  color: #222;
  background: var(--ik-primary);
  border-color: var(--ik-primary);
  font-weight: 700;
}

.ik-create-category-chip--placeholder {
  width: 72px;
  cursor: default;
  animation: ik-chip-placeholder-pulse 1.5s ease-in-out infinite;
}

@keyframes ik-chip-placeholder-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  .ik-create-category-chip--placeholder {
    animation: none;
    opacity: 0.5;
  }
}

.ik-create-tag-more__caret {
  font-style: normal;
  margin-left: 2px;
  font-size: var(--ik-text-xs);
}

.ik-create-tag-more :deep(.z-dropdown-item.is-selected) {
  color: var(--ik-primary);
  font-weight: 700;
}

/* ── Anonymous toggle ──────────────────────── */
.ik-create-anon-toggle {
  display: flex;
  align-items: center;
  gap: var(--ik-space-sm);
  padding: var(--ik-space-sm) 0;
  color: #999;
  font-size: var(--ik-text-sm);
  font-weight: 700;
  cursor: pointer;
}

.ik-create-anon-toggle span:nth-child(2) {
  flex: 1;
}

/* ── Cover grid ────────────────────────────── */
.ik-cover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
  padding: 2px 0;
}

.ik-cover-grid--settings {
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

/* ── Cover thumbnail ───────────────────────── */
.ik-cover-thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  width: 100%;
  border-radius: var(--ik-radius-sm);
  overflow: hidden;
  border: 2px solid transparent;
  background: #1e1e1e;
  transition: border-color 200ms, background 200ms, transform 200ms;
}

.ik-cover-thumb:hover {
  border-color: #fbfe00;
  background: #1a1a0a;
  transform: translateY(-2px);
}

.ik-cover-thumb--reorderable {
  cursor: grab;
}

.ik-cover-thumb--reorderable:active {
  cursor: grabbing;
}

.ik-cover-thumb--dragging {
  opacity: 0.4;
  transform: scale(0.96);
}

.ik-cover-thumb--drag-over {
  border-color: #fbfe00;
  box-shadow: 0 0 0 2px rgba(215, 255, 0, 0.45);
  transform: translateY(-2px);
}

.ik-cover-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ik-cover-thumb--video .ik-cover-thumb__img {
  filter: brightness(0.72);
}

.ik-cover-thumb__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ik-space-sm);
  color: #909090;
  padding: var(--ik-space-md);
  text-align: center;
}

.ik-cover-thumb__fallback-icon {
  width: 32px;
  height: 32px;
  color: #fbfe00;
}

.ik-cover-thumb__fallback-text {
  font-size: var(--ik-text-xs);
  font-weight: 700;
  word-break: break-all;
}

.ik-cover-thumb__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ik-cover-thumb__play-icon {
  width: 36px;
  height: 36px;
  color: #fff;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  opacity: 0.92;
}

.ik-cover-thumb__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ik-space-sm);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--ik-text-xs);
  font-weight: 700;
}

.ik-cover-thumb__overlay--error {
  background: rgba(0, 0, 0, 0.7);
  cursor: pointer;
}

.ik-cover-thumb__error-label {
  color: #ff6b6b;
  font-size: var(--ik-text-xs);
  font-weight: 700;
  letter-spacing: 0.3px;
}

.ik-cover-thumb__retry {
  padding: 3px 12px;
  border-radius: var(--ik-radius-pill);
  background: var(--ik-primary);
  color: #000;
  font-size: var(--ik-text-xs);
  font-weight: 900;
  letter-spacing: 0.3px;
}

.ik-cover-thumb__pct {
  font-size: var(--ik-text-base);
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;
}

.ik-cover-thumb__bar {
  width: 70%;
  height: 3px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 2px;
  overflow: hidden;
}

.ik-cover-thumb__progress {
  height: 100%;
  background: var(--ik-primary);
  border-radius: 2px;
  transition: width 200ms;
}

.ik-cover-thumb__spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid rgba(215, 255, 0, 0.25);
  border-top-color: var(--ik-primary);
  animation: ik-cover-spin 800ms linear infinite;
}

@keyframes ik-cover-spin {
  to { transform: rotate(360deg); }
}

.ik-cover-thumb__primary {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 2px var(--ik-space-sm);
  border-radius: var(--ik-radius-pill);
  background: var(--ik-primary);
  color: #000;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.3px;
  pointer-events: none;
}

.ik-cover-thumb__cover-badge {
  position: absolute;
  left: var(--ik-space-sm);
  top: var(--ik-space-sm);
  z-index: 2;
  padding: 3px var(--ik-space-sm);
  border-radius: var(--ik-radius-sm);
  background: var(--ik-primary);
  color: #111;
  font-size: var(--ik-text-xs);
  font-weight: 700;
}

.ik-cover-thumb__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 150ms, background 150ms;
}

.ik-cover-thumb:hover .ik-cover-thumb__remove,
.ik-cover-thumb:focus-within .ik-cover-thumb__remove {
  opacity: 1;
}

.ik-cover-thumb__remove:hover {
  background: rgba(255, 80, 80, 0.85);
}

/* ═════════ Mobile Bottom Bar (tablet + mobile) ═════════ */
.ik-create-mobile-bar {
  display: none;
}

/* Mobile sections: hidden on desktop/tablet, shown on mobile */
.ik-create-mobile-sections {
  display: none;
}

/* Mobile word bar */
.ik-mobile-word-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
}

/* Mobile preview */
.ik-mobile-preview {
  min-height: 220px;
  margin: 0 16px;
  border-radius: var(--ik-radius-sm);
}

/* Mobile toolbar - no border on mobile */
.ik-create-editor-toolbar--mobile {
  border-radius: 0;
  border-left: none;
  border-right: none;
  margin: 0;
}

/* ═════════ Mobile Sheets (Teleported to body) ═════════ */
.ik-mobile-sheet {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.ik-mobile-sheet__panel {
  width: 100%;
  max-width: 640px;
  background: #181818;
  border-radius: 16px 16px 0 0;
  padding: 10px 16px calc(var(--ik-space-xl) + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.4);
}

.ik-mobile-sheet__panel--full {
  height: 88vh;
  padding-top: 6px;
}

.ik-mobile-sheet__panel--drafts {
  max-height: 70vh;
  padding-top: 6px;
}

.ik-mobile-sheet__handle {
  width: 36px;
  height: 4px;
  margin: 6px auto 4px;
  border-radius: 99px;
  background: #383838;
}

.ik-mobile-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 6px;
}

.ik-mobile-sheet__title {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.ik-mobile-sheet__close {
  appearance: none;
  border: 0;
  background: transparent;
  color: #a0a0a0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.ik-mobile-sheet__close:active {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.ik-mobile-sheet__body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--ik-space-sm);
  padding: 4px 0 var(--ik-space-sm);
  -webkit-overflow-scrolling: touch;
}

.ik-mobile-sheet__body--compact {
  flex: 0 0 auto;
  padding: 6px 0 0;
}

.ik-mobile-sheet__body--no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ik-mobile-sheet__body--no-scrollbar::-webkit-scrollbar {
  display: none;
}

/* ── Draft rows (in sheets) ────────────────── */
.ik-mobile-draft-row {
  width: 100%;
  appearance: none;
  border: 1px solid #2a2a2a;
  background: #1f1f1f;
  border-radius: var(--ik-radius-md);
  padding: var(--ik-space-md) 14px;
  text-align: left;
  display: flex;
  align-items: center;
  gap: var(--ik-space-md);
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease, color 200ms ease;
  font-family: inherit;
}

.ik-mobile-draft-row:active {
  background: #262626;
}

.ik-mobile-draft-row.is-active {
  border-color: var(--ik-primary);
  background: var(--ik-primary);
}

.ik-mobile-draft-row__icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: #888;
  transition: color 200ms ease;
}

.ik-mobile-draft-row.is-active .ik-mobile-draft-row__icon {
  color: #000;
}

.ik-mobile-draft-row__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ik-mobile-draft-row__title {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 200ms ease;
}

.ik-mobile-draft-row.is-active .ik-mobile-draft-row__title {
  color: #000;
}

.ik-mobile-draft-row__meta {
  color: #9a9a9a;
  font-size: var(--ik-text-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 200ms ease;
}

.ik-mobile-draft-row.is-active .ik-mobile-draft-row__meta {
  color: rgba(0, 0, 0, 0.55);
}

.ik-mobile-draft-row--new .ik-mobile-draft-row__icon {
  color: var(--ik-primary);
}

.ik-mobile-draft-row--new .ik-mobile-draft-row__title {
  color: var(--ik-primary);
}

.ik-mobile-draft-row--new.is-active .ik-mobile-draft-row__icon,
.ik-mobile-draft-row--new.is-active .ik-mobile-draft-row__title {
  color: #000;
}

.ik-mobile-draft-empty {
  text-align: center;
  color: #6a6a6a;
  font-size: var(--ik-text-sm);
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ik-mobile-draft-empty__icon {
  width: 36px;
  height: 36px;
  color: #444;
}

.ik-mobile-draft-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(215, 255, 0, 0.25);
  border-top-color: var(--ik-primary);
  animation: ik-draft-spin 800ms linear infinite;
}

.ik-mobile-draft-spinner--small {
  width: 14px;
  height: 14px;
  border-width: 1.5px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
}

@keyframes ik-draft-spin {
  to { transform: rotate(360deg); }
}

.ik-mobile-draft-loadmore {
  appearance: none;
  border: 1px solid #2a2a2a;
  background: transparent;
  color: #b0b0b0;
  border-radius: var(--ik-radius-pill);
  height: 40px;
  font-family: inherit;
  font-size: var(--ik-text-sm);
  cursor: pointer;
  margin: var(--ik-space-sm) auto 4px;
  padding: 0 18px;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: background 140ms ease, opacity 140ms ease;
}

.ik-mobile-draft-loadmore:active {
  background: rgba(255, 255, 255, 0.04);
}

.ik-mobile-draft-loadmore:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ik-draft-list-enter-active {
  transition: opacity 250ms ease, transform 250ms ease;
}

.ik-draft-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.ik-draft-list-move {
  transition: transform 250ms ease;
}

/* ── Settings rows (in sheets) ─────────────── */
.ik-mobile-settings-row {
  width: 100%;
  appearance: none;
  border: 1px solid #2a2a2a;
  background: #1f1f1f;
  border-radius: var(--ik-radius-md);
  padding: 14px;
  display: flex;
  align-items: center;
  gap: var(--ik-space-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 140ms ease;
}

.ik-mobile-settings-row:active {
  background: #262626;
}

.ik-mobile-settings-row__icon {
  width: 20px;
  height: 20px;
  color: #c0c0c0;
  flex-shrink: 0;
}

.ik-mobile-settings-row__title {
  flex: 1;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.ik-mobile-settings-row__chevron {
  width: 18px;
  height: 18px;
  color: #686868;
  flex-shrink: 0;
}

.ik-mobile-settings-row--danger .ik-mobile-settings-row__icon,
.ik-mobile-settings-row--danger .ik-mobile-settings-row__title {
  color: #ff6b6b;
}

.ik-mobile-settings-row--active {
  background: var(--ik-primary);
  border-color: var(--ik-primary);
}

.ik-mobile-settings-row--active:active {
  background: var(--ik-primary);
}

.ik-mobile-settings-row--active .ik-mobile-settings-row__title {
  color: #222;
  font-weight: 700;
}

.ik-mobile-settings-row__check {
  width: 18px;
  height: 18px;
  color: #222;
  flex-shrink: 0;
}

.ik-mobile-cat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ik-mobile-cat-grid .ik-mobile-draft-empty {
  grid-column: 1 / -1;
}

.ik-mobile-settings-row--toggle {
  cursor: pointer;
}

.ik-mobile-settings-row__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ik-mobile-settings-row__text .ik-mobile-settings-row__title {
  flex: none;
}

.ik-mobile-settings-row__desc {
  color: #8a8a8a;
  font-size: var(--ik-text-xs);
  font-weight: 500;
}

.ik-mobile-sheet-enter-active,
.ik-mobile-sheet-leave-active {
  transition: opacity 220ms ease;
}

.ik-mobile-sheet-enter-active .ik-mobile-sheet__panel,
.ik-mobile-sheet-leave-active .ik-mobile-sheet__panel {
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ik-mobile-sheet-enter-from,
.ik-mobile-sheet-leave-to {
  opacity: 0;
}

.ik-mobile-sheet-enter-from .ik-mobile-sheet__panel,
.ik-mobile-sheet-leave-to .ik-mobile-sheet__panel {
  transform: translateY(100%);
}

/* ═════════ Responsive: Tablet (≤1023px) ═════════ */
@media (max-width: 1023px) {
  .ik-create-page {
    height: auto;
    min-height: calc(100vh - 78px);
    overflow: visible;
    padding: var(--ik-space-xl) 0 var(--ik-space-2xl);
    padding-bottom: calc(var(--ik-space-2xl) + 62px + env(safe-area-inset-bottom, 0px));
  }

  .ik-create-columns {
    grid-template-columns: 1fr 240px;
    height: auto;
    overflow: visible;
  }

  .ik-create-sidebar {
    display: none;
  }

  .ik-create-editor {
    height: auto;
    min-height: 50vh;
  }

  .ik-create-editor__inner {
    max-height: 60vh;
  }

  .ik-create-mobile-bar {
    display: flex;
  }

  .ik-create-mobile-sections {
    display: none;
  }
}

/* ═════════ Responsive: Mobile (≤768px) ═════════ */
@media (max-width: 768px) {
  .ik-create-page {
    width: 100%;
    margin: 0;
    padding: 0 0 calc(62px + env(safe-area-inset-bottom, 0px));
    gap: 0;
    height: auto;
    min-height: calc(100vh - 62px);
    overflow: visible;
    background: #121212;
    overscroll-behavior-y: contain;
  }

  .ik-create-columns {
    display: none !important;
  }

  .ik-create-mobile-bar {
    display: flex;
  }

  .ik-create-mobile-sections {
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    min-height: calc(100vh - 62px);
    background: #121212;
  }

  /* ── Cover strip ──────────────────────────── */
  .ik-mobile-cover-strip {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 14px 16px var(--ik-space-sm);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .ik-mobile-cover-strip::-webkit-scrollbar {
    display: none;
  }

  .ik-mobile-cover-add {
    flex: 0 0 auto;
    width: 90px;
    height: 90px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    appearance: none;
    border-radius: 10px;
    border: 1px dashed #2a2a2a;
    background: #1a1a1a;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease;
  }

  .ik-mobile-cover-add:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .ik-mobile-cover-add:active:not(:disabled) {
    background: #232323;
    border-color: #3a3a3a;
  }

  .ik-mobile-cover-add__icon {
    width: 30px;
    height: 30px;
    color: #909090;
  }

  .ik-mobile-cover-tile {
    flex: 0 0 auto;
    position: relative;
    width: 90px;
    height: 90px;
    border-radius: var(--ik-radius-sm);
    overflow: hidden;
    background: #1a1a1a;
    cursor: pointer;
  }

  .ik-mobile-cover-tile__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .ik-mobile-cover-tile__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }

  .ik-mobile-cover-tile__pct {
    color: #fff;
    font-size: var(--ik-text-sm);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .ik-mobile-cover-tile__spinner {
    width: 22px;
    height: 22px;
    border: 2.5px solid rgba(215, 255, 0, 0.25);
    border-top-color: var(--ik-primary);
    border-radius: 50%;
    animation: ik-mobile-spin 800ms linear infinite;
  }

  .ik-mobile-cover-tile__retry {
    appearance: none;
    border: 0;
    padding: 3px 10px;
    border-radius: 10px;
    background: var(--ik-primary);
    color: #000;
    font-size: var(--ik-text-xs);
    font-weight: 900;
    cursor: pointer;
  }

  .ik-mobile-cover-tile__primary {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(215, 255, 0, 0.85);
    color: #000;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .ik-mobile-cover-tile__remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .ik-mobile-cover-tile--video .ik-mobile-cover-tile__img {
    filter: brightness(0.72);
  }

  .ik-mobile-cover-tile__fallback {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #909090;
    padding: var(--ik-space-sm);
    text-align: center;
  }

  .ik-mobile-cover-tile__fallback-icon {
    width: 24px;
    height: 24px;
    color: #fbfe00;
  }

  .ik-mobile-cover-tile__fallback-text {
    font-size: 10px;
    font-weight: 700;
    word-break: break-all;
  }

  .ik-mobile-cover-tile__play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .ik-mobile-cover-tile__play-icon {
    width: 28px;
    height: 28px;
    color: #fff;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    opacity: 0.92;
  }

  @keyframes ik-mobile-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Setting rows ─────────────────────────── */
  .ik-mobile-row {
    width: 100%;
    appearance: none;
    border: 0;
    background: transparent;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    font-family: inherit;
    font-size: 16px;
    text-align: left;
    cursor: pointer;
    transition: background 140ms ease;
  }

  .ik-mobile-row:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .ik-mobile-row:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ik-mobile-row__icon {
    width: 20px;
    height: 20px;
    color: #9a9a9a;
    flex-shrink: 0;
  }

  .ik-mobile-row__title {
    flex: 1;
    font-weight: 700;
  }

  .ik-mobile-row__value {
    color: #9a9a9a;
    font-size: var(--ik-text-base);
    font-variant-numeric: tabular-nums;
  }

  .ik-mobile-row__chevron {
    width: 20px;
    height: 20px;
    color: #686868;
    flex-shrink: 0;
  }

  .ik-mobile-divider {
    height: 1px;
    background: #2a2a2a;
  }
}

/* ═════════ Mobile Bottom Bar ═════════ */
.ik-create-mobile-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  height: calc(62px + env(safe-area-inset-bottom, 0px));
  padding: var(--ik-space-sm) var(--ik-space-md) calc(var(--ik-space-sm) + env(safe-area-inset-bottom, 0px));
  background: #181818;
  border-top: 1px solid #2a2a2a;
  align-items: center;
  gap: var(--ik-space-sm);
}

.ik-create-mobile-bar__drafts {
  flex: 0 0 auto;
  position: relative;
  width: 46px;
  height: 42px;
  padding: 0;
  appearance: none;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #a0a0a0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease;
}

.ik-create-mobile-bar__drafts:active {
  background: rgba(255, 255, 255, 0.06);
}

.ik-create-mobile-bar__drafts-icon {
  width: 24px;
  height: 24px;
}

.ik-create-mobile-bar__drafts-count {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--ik-radius-sm);
  background: #fbc02d;
  color: #000;
  font-size: 10px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
}

.ik-create-mobile-bar__publish {
  flex: 1;
  appearance: none;
  border: 0;
  height: 42px;
  border-radius: 21px;
  background: var(--ik-primary);
  color: #000;
  font-family: inherit;
  font-size: 15px;
  font-weight: 900;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ik-space-sm);
  transition: filter 140ms ease, background 140ms ease;
}

.ik-create-mobile-bar__publish:active:not(.is-disabled) {
  filter: brightness(0.92);
}

.ik-create-mobile-bar__publish.is-disabled {
  background: rgba(215, 255, 0, 0.32);
  color: rgba(0, 0, 0, 0.6);
  cursor: not-allowed;
}

.ik-create-mobile-bar__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: ik-mobile-spin 700ms linear infinite;
}

/* ── Status dot ────────────────────────────── */
.ik-status {
  display: inline-flex;
  align-items: center;
  gap: var(--ik-space-sm);
}

.ik-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ik-primary);
  animation: ik-status-pulse 1.5s ease-in-out infinite;
}

@keyframes ik-status-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* ── Reduced motion ────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* ── Wide breakpoint adjustments ───────────── */
@media (max-width: 1280px) {
  .ik-create-page {
    width: calc(100% - 32px);
  }
}

@media (max-width: 500px) {
  .ik-create-page {
    width: 100%;
    padding: 0 0 90px;
    gap: 0;
  }

  .ik-create-mobile-sections {
    padding: 0 12px;
  }
}
</style>
