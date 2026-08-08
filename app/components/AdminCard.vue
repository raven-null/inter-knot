<template>
  <section class="ik-admin-card">
    <h3 v-if="$slots.title" class="ik-admin-card__title">
      <slot name="title" />
    </h3>
    <slot />
  </section>
</template>
