<script setup lang="ts">
import { ref } from 'vue'
import Current from '../../../src/renderer/shared/components/SongFontSizeInput.vue'
import Refined from './RefinedNumberInput.vue'

const theme = ref<'dark' | 'light'>('dark')
const original = ref({ size: 14, weight: 600, spacing: 8, percent: 100 })
const refined = ref({ size: 14, weight: 600, spacing: 8, percent: 100 })
function reset() {
  original.value = { size: 14, weight: 600, spacing: 8, percent: 100 }
  refined.value = { size: 14, weight: 600, spacing: 8, percent: 100 }
}
</script>
<template>
  <main :data-theme="theme">
    <div class="content">
      <header>
        <p class="eyebrow">AURALIS · 设置组件</p>
        <h1>数值输入微调</h1>
        <p class="intro">在同一个设置面板中比较当前组件和微调版本。试试加减、直接输入和键盘方向键。</p>
        <div class="toolbar"><button type="button" @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme === 'dark' ? '切换浅色' : '切换深色' }}</button><button type="button" @click="reset">重置数值</button></div>
      </header>
      <div class="comparison">
        <section v-for="version in ['current', 'refined'] as const" :key="version" class="comparison-column">
          <div class="column-heading"><div><span class="index">{{ version === 'current' ? '01 / 当前' : '02 / 微调' }}</span><h2>{{ version === 'current' ? '现有组件' : '紧凑与清晰' }}</h2></div><span v-if="version === 'refined'" class="tag">建议方向</span></div>
          <p class="description">{{ version === 'current' ? '播放器正在使用的原组件。' : '缩短宽度，扩大按钮区域，增强悬停和编辑反馈。' }}</p>
          <div class="panel">
            <div class="panel-head"><div><h3>曲目显示</h3><p>调整文字与封面信息的显示方式</p></div><span class="panel-dots">···</span></div>
            <div class="group-title">文字参数</div>
            <div class="row"><div><label :for="`${version}-size`">曲名字号</label><small>调整曲目标题的大小</small></div><component :is="version === 'current' ? Current : Refined" :id="`${version}-size`" label="曲名" :model-value="version === 'current' ? original.size : refined.size" :min="10" :max="28" @update:model-value="version === 'current' ? original.size = $event : refined.size = $event" /></div>
            <div class="row"><div><label :for="`${version}-weight`">曲名字重</label><small>调整曲目标题的粗细</small></div><component :is="version === 'current' ? Current : Refined" :id="`${version}-weight`" label="曲名" :model-value="version === 'current' ? original.weight : refined.weight" :min="400" :max="900" :step="100" kind="weight" @update:model-value="version === 'current' ? original.weight = $event : refined.weight = $event" /></div>
            <div class="row"><div><label :for="`${version}-spacing`">信息间距</label><small>调整文字之间的距离</small></div><component :is="version === 'current' ? Current : Refined" :id="`${version}-spacing`" label="信息间距" :model-value="version === 'current' ? original.spacing : refined.spacing" :min="0" :max="24" kind="spacing" @update:model-value="version === 'current' ? original.spacing = $event : refined.spacing = $event" /></div>
            <div class="row"><div><label :for="`${version}-percent`">歌词大小</label><small>按比例调整显示大小</small></div><component :is="version === 'current' ? Current : Refined" :id="`${version}-percent`" label="歌词大小" :model-value="version === 'current' ? original.percent : refined.percent" :min="50" :max="150" :step="5" kind="percent" @update:model-value="version === 'current' ? original.percent = $event : refined.percent = $event" /></div>
            <div class="row"><div><label :for="`${version}-disabled`">禁用状态</label><small>不适用于当前显示方式</small></div><component :is="version === 'current' ? Current : Refined" :id="`${version}-disabled`" label="禁用示例" :model-value="12" :min="4" :max="24" disabled /></div>
          </div>
        </section>
      </div>
      <p class="footnote">两栏的数值相互独立。微调版沿用现有组件的输入、范围与键盘行为；此页面不保存或修改播放器设置。</p>
    </div>
  </main>
</template>
