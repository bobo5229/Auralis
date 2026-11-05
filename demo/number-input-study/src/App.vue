<script setup>
import { ref } from 'vue'
import { NumberFieldRoot, NumberFieldInput, NumberFieldIncrement, NumberFieldDecrement } from 'reka-ui'
import InputNumber from 'primevue/inputnumber'
import { ElInputNumber } from 'element-plus'
const theme = ref('dark')
const reka = ref(14), prime = ref(14), element = ref(14)
function reset() { reka.value = prime.value = element.value = 14 }
</script>
<template>
  <main :class="theme">
    <header><p class="eyebrow">AURALIS / COMPONENT STUDY</p><h1>数值输入组件</h1><p class="intro">三家真实 Vue 组件，在同一组专辑列表设置中比较。可输入数值，也可以使用加减按钮与方向键。</p><div class="tools"><button @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme === 'dark' ? '切换浅色' : '切换深色' }}</button><button @click="reset">重置数值</button></div></header>
    <section class="grid">
      <article class="study"><div class="heading"><span class="index">01 / 推荐</span><h2>Reka UI <small>Number Field</small></h2><p>无预设外观，使用 Auralis 风格定制；适合保留播放器的界面语言。</p></div><div class="panel"><div class="panel-title">专辑列表参数 <span>外观</span></div><div class="setting"><div><b>封面圆角</b><small>调整专辑封面的边缘</small></div><NumberFieldRoot v-model="reka" :min="4" :max="24" :step="1" class="reka-field"><NumberFieldDecrement class="reka-button" aria-label="减小封面圆角">−</NumberFieldDecrement><div class="reka-value"><NumberFieldInput aria-label="封面圆角" /><span>px</span></div><NumberFieldIncrement class="reka-button" aria-label="增大封面圆角">+</NumberFieldIncrement></NumberFieldRoot></div><div class="setting muted"><div><b>专辑信息</b><small>在封面下方显示标题</small></div><span class="switch"></span></div></div><p class="note">样式由本 Demo 定制 · 组件行为来自 Reka</p></article>
      <article class="study"><div class="heading"><span class="index">02 / 现成主题</span><h2>PrimeVue <small>InputNumber</small></h2><p>自带主题、单位后缀和多种按钮布局，适合希望快速获得完整控件的场景。</p></div><div class="panel"><div class="panel-title">专辑列表参数 <span>外观</span></div><div class="setting"><div><b>封面圆角</b><small>调整专辑封面的边缘</small></div><InputNumber v-model="prime" :min="4" :max="24" :step="1" showButtons buttonLayout="horizontal" suffix=" px" inputId="prime-number" aria-label="封面圆角" class="prime-field"><template #incrementbuttonicon><span>+</span></template><template #decrementbuttonicon><span>−</span></template></InputNumber></div><div class="setting muted"><div><b>专辑信息</b><small>在封面下方显示标题</small></div><span class="switch"></span></div></div><p class="note">使用 Aura 主题 · PrimeVue 4 · MIT 许可</p></article>
      <article class="study"><div class="heading"><span class="index">03 / 现成主题</span><h2>Element Plus <small>Input Number</small></h2><p>成熟的一体式组件，默认左右按钮；若要匹配播放器，需要覆盖其默认视觉风格。</p></div><div class="panel"><div class="panel-title">专辑列表参数 <span>外观</span></div><div class="setting"><div><b>封面圆角</b><small>调整专辑封面的边缘</small></div><div class="element-wrap"><ElInputNumber v-model="element" :min="4" :max="24" :step="1" aria-label="封面圆角" size="small" /><span>px</span></div></div><div class="setting muted"><div><b>专辑信息</b><small>在封面下方显示标题</small></div><span class="switch"></span></div></div><p class="note">Element Plus 默认样式 · 单位由外层补充</p></article>
    </section><footer>示例值仅在此页面生效。组件的默认主题与定制主题不同；此处以融入 Auralis 的效果为重点，具体输入提交时机与滚轮行为需在正式接入前核对。</footer>
  </main>
</template>

