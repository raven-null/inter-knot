<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const list = ref<any[]>([]);
const loading = ref(false);

const form = ref({
  name: "",
  slug: "",
  description: "",
  sortOrder: 0,
  editing: null as any | null,
});

const load = async () => {
  loading.value = true;
  try {
    list.value = await admin.categories();
  } finally {
    loading.value = false;
  }
};

const submit = async () => {
  if (!form.value.name || !form.value.slug) {
    window.alert("请填写名称与标识");
    return;
  }
  if (form.value.editing) {
    await admin.updateCategory(form.value.editing.documentId, {
      name: form.value.name,
      slug: form.value.slug,
      description: form.value.description,
      sortOrder: Number(form.value.sortOrder) || 0,
    });
  } else {
    await admin.createCategory({
      name: form.value.name,
      slug: form.value.slug,
      description: form.value.description,
      sortOrder: Number(form.value.sortOrder) || 0,
    });
  }
  resetForm();
  await load();
};

const edit = (c: any) => {
  form.value = { name: c.name, slug: c.slug, description: c.description, sortOrder: c.sortOrder, editing: c };
};

const resetForm = () => {
  form.value = { name: "", slug: "", description: "", sortOrder: 0, editing: null };
};

const remove = async (c: any) => {
  if (!window.confirm(`确认删除版块「${c.name}」？`)) return;
  await admin.deleteCategory(c.documentId);
  await load();
};

const toggleHidden = async (c: any) => {
  await admin.updateCategory(c.documentId, { isHidden: !c.isHidden });
  c.isHidden = !c.isHidden;
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-card">
      <h3 class="ik-admin-card__title">{{ form.editing ? "编辑版块" : "新增版块" }}</h3>
      <div class="ik-admin-toolbar">
        <input v-model="form.name" class="ik-admin-input" placeholder="名称（如：游戏交流）" />
        <input v-model="form.slug" class="ik-admin-input" placeholder="标识（如：game）" />
        <input v-model="form.description" class="ik-admin-input" placeholder="描述" style="flex: 1" />
        <input v-model.number="form.sortOrder" class="ik-admin-input" type="number" placeholder="排序" style="min-width: 80px" />
        <button class="ik-admin-btn ik-admin-btn--primary" @click="submit">{{ form.editing ? "保存" : "新增" }}</button>
        <button v-if="form.editing" class="ik-admin-btn" @click="resetForm">取消</button>
      </div>
    </div>

    <div class="ik-admin-card">
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>排序</th>
            <th>名称</th>
            <th>标识</th>
            <th>描述</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in list" :key="c.documentId">
            <td>{{ c.sortOrder }}</td>
            <td>{{ c.name }}</td>
            <td><code style="color: var(--ik-primary, #bfff09)">{{ c.slug }}</code></td>
            <td>{{ c.description }}</td>
            <td>
              <span class="ik-admin-badge" :class="c.isHidden ? 'ik-admin-badge--red' : 'ik-admin-badge--green'">
                {{ c.isHidden ? "隐藏" : "显示" }}
              </span>
            </td>
            <td>
              <div style="display: flex; gap: 6px">
                <button class="ik-admin-btn" @click="edit(c)">编辑</button>
                <button class="ik-admin-btn" @click="toggleHidden(c)">{{ c.isHidden ? "显示" : "隐藏" }}</button>
                <button class="ik-admin-btn ik-admin-btn--danger" @click="remove(c)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
