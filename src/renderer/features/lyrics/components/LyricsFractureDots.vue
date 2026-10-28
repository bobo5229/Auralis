<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useReducedMotion } from '../composables/useReducedMotion'
import { createCountdownParticles, getCountdownFractureProgress } from '../utils/countdownParticles'

const props = defineProps<{ elapsed: number }>()
const motion = useReducedMotion()
onBeforeUnmount(motion.dispose)
const grains = [1, 2, 3].map(createCountdownParticles)
const progress = computed(() =>
  // Reverse the DOM order so the rightmost dot breaks first.
  grains.map((_, index) => getCountdownFractureProgress(props.elapsed, grains.length - 1 - index)),
)
</script>

<template>
  <span
    v-for="(particles, index) in grains"
    :key="index"
    class="lyrics-fracture-dot"
    :data-fracture-progress="progress[index]"
    :style="{ '--fracture-delay': `${-progress[index]}s` }"
    aria-hidden="true"
  >
    <span
      class="lyrics-fracture-solid"
      :style="{
        opacity: motion.matches.value ? 1 - progress[index] : progress[index] === 0 ? 1 : 0,
      }"
    />
    <svg
      v-if="!motion.matches.value && progress[index] > 0 && progress[index] < 1"
      viewBox="0 0 12 12"
      class="lyrics-fracture-particles"
    >
      <circle
        v-for="(particle, particleIndex) in particles"
        :key="particleIndex"
        :cx="particle.x"
        :cy="particle.y"
        :r="particle.radius"
        :style="{ '--particle-x': `${particle.dx}px`, '--particle-y': `${particle.dy}px` }"
      />
    </svg>
  </span>
</template>

<style scoped>
.lyrics-fracture-dot {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  width: var(--lyrics-countdown-dot-size, 0.28em);
  height: var(--lyrics-countdown-dot-size, 0.28em);
}

.lyrics-fracture-solid {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
}

.lyrics-fracture-particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  fill: currentColor;
}

.lyrics-fracture-particles circle {
  transform-box: fill-box;
  transform-origin: center;
  /* Sample the animation from the playback clock; never run a separate timer. */
  animation: lyrics-fracture 1s cubic-bezier(0.16, 0.55, 0.36, 1) both paused;
  animation-delay: var(--fracture-delay);
}

@keyframes lyrics-fracture {
  from {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  20% {
    opacity: 0.85;
  }
  to {
    transform: translate(var(--particle-x), var(--particle-y)) scale(0.25);
    opacity: 0;
  }
}
</style>
