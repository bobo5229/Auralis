<template>
  <div class="fluid-artwork-background-vignette" />
  <div class="fluid-artwork-background-noise" />
</template>

<style scoped>
.fluid-artwork-background-vignette,
.fluid-artwork-background-noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.fluid-artwork-background-vignette {
  z-index: 1;
  opacity: var(--background-flow-effects, 1);
  background:
    radial-gradient(
      ellipse at 34% 43%,
      transparent 0 23%,
      rgba(0, 0, 0, 0.14) 62%,
      rgba(0, 0, 0, 0.45) 100%
    ),
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.08) 0%,
      transparent 30%,
      transparent 60%,
      rgba(14, 17, 23, 0.4) 80%,
      rgba(14, 17, 23, 0.8) 100%
    );
}
.fluid-artwork-background-noise {
  z-index: 2;
  opacity: calc(0.035 * var(--background-flow-effects, 1));
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
}
</style>
