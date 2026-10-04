<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { createAlbumDropMotion, type AlbumDropRequest } from '../utils/albumDropMotion'

const emit = defineEmits<{ activeChange: [active: boolean] }>()
const rootRef = ref<HTMLElement | null>(null)
let controller: ReturnType<typeof createAlbumDropMotion> | null = null

function play(request: AlbumDropRequest): void {
  const root = rootRef.value
  if (!root?.isConnected) return
  controller ??= createAlbumDropMotion(root, (active) => emit('activeChange', active))
  controller.play(request)
}

function cancel(): void {
  controller?.cancel()
}
onBeforeUnmount(cancel)
defineExpose({ play, cancel })
</script>

<template>
  <Teleport to="body">
    <div ref="rootRef" class="album-drop-layer" aria-hidden="true" inert style="display: none" />
  </Teleport>
</template>

<style>
.album-drop-muted {
  filter: blur(6px) brightness(0.82);
  pointer-events: none;
  transition: filter 240ms ease-out;
  -webkit-app-region: no-drag;
}
.album-drop-muted--returning {
  filter: blur(0) brightness(1);
}
.album-drop-layer {
  position: fixed;
  z-index: 80;
  inset: 0;
  pointer-events: none;
  perspective: 1100px;
}
.album-drop-cover {
  position: absolute;
  z-index: 2;
  border-radius: 12px;
  box-shadow: 0 24px 54px #0008;
  transform-origin: center;
}
.album-drop-cover > .cover-frame {
  width: 100%;
  height: 100%;
}
.album-drop-disc-position {
  position: absolute;
  z-index: 1;
  transform-origin: center;
  transform-style: preserve-3d;
  /* Opacity in will-change flattens this object and defeats the two faces. */
  will-change: transform;
}
.album-drop-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  backface-visibility: hidden;
  transform: translateZ(0.75px);
  background:
    radial-gradient(
      circle,
      transparent 0 9%,
      #cfcbc7 9.5% 13%,
      #626b67 13.5% 14%,
      transparent 14.5% 18%,
      #e3e6dfaa 18.5% 19%,
      transparent 19.5%
    ),
    conic-gradient(
      from 24deg,
      #d4dad5,
      #fff,
      #999f9b,
      #e3cbb7,
      #c7b9d3,
      #fff,
      #8e9792,
      #b9d5d0,
      #e6e1b4,
      #e9ece6,
      #d4dad5
    );
  mask-image: radial-gradient(circle, transparent 0 8%, #000 8.8%);
  box-shadow:
    inset 0 0 0 1px #ffffff99,
    inset 0 0 0 4px #6b726855;
}
.album-drop-disc::after {
  position: absolute;
  inset: 3%;
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle,
    transparent 0 1px,
    #a0a79d33 1px 1.6px,
    transparent 1.6px 3px
  );
  opacity: 0.4;
  content: '';
}
.album-drop-disc-back {
  transform: rotateX(180deg) translateZ(0.75px);
}
.album-drop-disc-back img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.album-drop-disc-label,
.album-drop-disc-subtitle {
  position: absolute;
  left: 18%;
  right: 18%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: #313a32;
}
.album-drop-disc-label {
  top: 24%;
  font-weight: 600;
}
.album-drop-disc-subtitle {
  bottom: 24%;
  color: #4c564d;
}
</style>
