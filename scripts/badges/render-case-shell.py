"""Bake the rounded aluminum shell with an orthographic camera and a GGX BRDF."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


WIDTH, HEIGHT = 440, 428
SCALE = 2
TOP, BOTTOM = 22.0, 0.0
CAMERA_SHEAR = 0.48


def rounded_rectangle(x, y, center, half_size, radius):
    dx = np.abs(x - center[0]) - (half_size[0] - radius)
    dy = np.abs(y - center[1]) - (half_size[1] - radius)
    return np.hypot(np.maximum(dx, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(dx, dy), 0) - radius


def shell(x, y, z, recessed):
    # A rounded extrusion with a 3 px top roll and a 2 px lower roll.
    upper = np.maximum(z - (TOP - 3), 0)
    lower = np.maximum(2 - z, 0)
    outer_inset = 3 - np.sqrt(np.maximum(9 - upper**2, 0))
    outer_inset += 2 - np.sqrt(np.maximum(4 - lower**2, 0))
    outside = rounded_rectangle(x, y, (220, 208), (220, 208), 28) + outer_inset
    if not recessed:
        return np.maximum.reduce((outside, z - TOP, BOTTOM - z))

    # Cut the cavity through the shell. The top lip curves into a sloped wall.
    lip = np.maximum(z - (TOP - 3), 0)
    opening = rounded_rectangle(x, y, (220, 232), (198, 162), 11)
    opening -= 3 - np.sqrt(np.maximum(9 - lip**2, 0))
    opening += np.maximum(TOP - 3 - z, 0) * 0.42
    return np.maximum.reduce((outside, -opening, z - TOP, BOTTOM - z))


def unit(vector):
    return vector / np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-8)


def trace(recessed):
    screen_y, x = np.mgrid[: HEIGHT * SCALE, : WIDTH * SCALE].astype(np.float32)
    screen_y = (screen_y + 0.5) / SCALE
    x = (x + 0.5) / SCALE
    hit_depth = np.full_like(x, -1)
    for depth in np.linspace(TOP, BOTTOM, 89):
        y = screen_y - (TOP - depth) * CAMERA_SHEAR
        hit = (hit_depth < 0) & (shell(x, y, np.full_like(x, depth), recessed) <= 0)
        hit_depth[hit] = depth

    mask = hit_depth >= 0
    x = x[mask]
    z = hit_depth[mask]
    screen_y = screen_y[mask]
    low = z.copy()
    high = z + 0.25
    for _ in range(6):
        middle = (low + high) * 0.5
        y = screen_y - (TOP - middle) * CAMERA_SHEAR
        inside = shell(x, y, middle, recessed) <= 0
        low = np.where(inside, middle, low)
        high = np.where(inside, high, middle)
    z = low
    y = screen_y - (TOP - z) * CAMERA_SHEAR
    epsilon = 0.025
    normal = unit(np.stack((
        shell(x + epsilon, y, z, recessed) - shell(x - epsilon, y, z, recessed),
        shell(x, y + epsilon, z, recessed) - shell(x, y - epsilon, z, recessed),
        shell(x, y, z + epsilon, recessed) - shell(x, y, z - epsilon, recessed),
    ), axis=-1))
    return mask, x, y, z, normal


def brush_grain(x, across):
    """Aperiodic grooves with long strokes and two cross-grain scales."""
    rng = np.random.default_rng(709)
    grain = np.zeros_like(x)
    for length, spacing, strength in ((110, 2.1, 0.74), (58, 4.6, 0.36)):
        along = x / length
        cross = across / spacing + 16
        col, row = along.astype(int), cross.astype(int)
        u, v = along - col, cross - row
        u = u * u * (3 - 2 * u)
        v = v * v * (3 - 2 * v)
        knots = rng.uniform(-1, 1, (int(row.max()) + 2, int(col.max()) + 2))
        lower = knots[row, col] * (1 - u) + knots[row, col + 1] * u
        upper = knots[row + 1, col] * (1 - u) + knots[row + 1, col + 1] * u
        grain += strength * (lower * (1 - v) + upper * v)
    return grain


def shade(x, y, z, normal, recessed):
    # Follow the roll around the edges. Use the horizontal axis on the front wall.
    tangent = np.cross(np.array([0, 1, 0]), normal)
    side = np.linalg.norm(tangent, axis=-1) < 1e-5
    tangent[side] = [1, 0, 0]
    tangent = unit(tangent)
    tangent *= np.where(tangent[:, 0:1] < 0, -1, 1)
    bitangent = np.cross(normal, tangent)
    grain = brush_grain(x, y + (TOP - z) * 0.65)
    normal = unit(normal + (0.026 * grain)[:, None] * bitangent)
    bitangent = np.cross(normal, tangent)
    view = unit(np.array([0, CAMERA_SHEAR, 1]))
    facing = np.maximum(normal @ view, 0.0001)

    # Keep a slightly sharper machined edge within the same satin finish.
    bevel = np.clip((1 - np.abs(normal[:, 2])) * 2, 0, 1)
    roughness = np.clip(0.49 - 0.075 * bevel + 0.038 * grain, 0.36, 0.60)
    alpha = roughness**2
    # Anisotropic GGX with correlated Smith visibility, following Filament's
    # anisotropic BRDF equations. The grooves scatter more across the grain.
    alpha_along = alpha * 0.65
    alpha_across = alpha * 1.55
    view_slope = np.sqrt(
        facing**2 + (alpha_along * (tangent @ view))**2 + (alpha_across * (bitangent @ view))**2
    )
    fresnel_at_normal = np.array([0.83, 0.85, 0.85])
    reflected = np.zeros((x.size, 3))

    # Integrate samples across three broad studio cards at a finite distance.
    softboxes = [
        ((-0.37, -0.55), (0.93, 0.62), [0.89, 0.87, 0.83], 2.55),
        ((0.65, 0.58), (0.62, 0.48), [0.82, 0.86, 0.88], 1.15),
        ((-0.22, 1.22), (0.78, 0.52), [0.79, 0.81, 0.83], 0.8),
    ]
    for center, extent, color, intensity in softboxes:
        color = np.array(color)
        for u in np.linspace(-1, 1, 7):
            for v in np.linspace(-1, 1, 5):
                direction = unit(np.stack((
                    center[0] + u * extent[0] - (x - 220) / 850,
                    center[1] + v * extent[1] - (y - 208) / 850,
                    (850 - z) / 850,
                ), axis=-1))
                half_vector = unit(direction + view)
                light = np.maximum(np.sum(normal * direction, axis=-1), 0)
                alignment = np.maximum(np.sum(normal * half_vector, axis=-1), 0)
                half_along = np.sum(tangent * half_vector, axis=-1)
                half_across = np.sum(bitangent * half_vector, axis=-1)
                half_slope = (half_along / alpha_along)**2 + (half_across / alpha_across)**2 + alignment**2
                distribution = 1 / (np.pi * alpha_along * alpha_across * np.maximum(half_slope, 1e-5)**2)
                light_along = np.sum(tangent * direction, axis=-1)
                light_across = np.sum(bitangent * direction, axis=-1)
                light_slope = np.sqrt(light**2 + (alpha_along * light_along)**2 + (alpha_across * light_across)**2)
                visibility = 0.5 / np.maximum(light * view_slope + facing * light_slope, 1e-5)
                grazing = (1 - half_vector @ view)**5
                fresnel = fresnel_at_normal + (1 - fresnel_at_normal) * grazing[:, None]
                weight = intensity * np.exp(-0.6 * (u*u + v*v)) / 35
                attenuation = np.sum(direction[:, :2]**2, axis=-1)
                reflected += (weight * distribution * visibility * light * (1 - attenuation) * (alignment > 0))[:, None] * fresnel * color

    # Ambient reflection and a small amount of occlusion near the recessed liner.
    up = np.maximum(normal[:, 2], 0)
    ambient = 0.115 + 0.09 * up + 0.04 * np.maximum(-normal[:, 1], 0)
    linear = reflected + ambient[:, None] * fresnel_at_normal
    # Approximate micro-occlusion within the shallow machining grooves.
    linear *= (1 - 0.22 * np.maximum(-grain, 0))[:, None]
    if recessed:
        cavity = rounded_rectangle(x, y, (220, 232), (198, 162), 11)
        occlusion = 1 - 0.46 * np.clip((TOP - z) / 9, 0, 1) * np.exp(-np.abs(cavity) / 7)
        linear *= occlusion[:, None]
    mapped = (1.55 * linear) / (1 + 0.96 * linear)
    # Roll bright reflections into a soft shoulder while retaining the face midtones.
    peak = mapped.max(axis=-1, keepdims=True)
    knee, ceiling = 0.57, 0.86
    excess = np.maximum(peak - knee, 0)
    compressed = np.minimum(peak, knee) - (ceiling - knee) * np.expm1(-excess / (ceiling - knee))
    mapped *= compressed / np.maximum(peak, 1e-8)
    srgb = np.where(mapped <= 0.0031308, mapped * 12.92, 1.055 * mapped ** (1 / 2.4) - 0.055)
    return np.uint8(np.clip(srgb, 0, 1) * 255 + 0.5)


def bake(recessed):
    mask, x, y, z, normal = trace(recessed)
    rgba = np.zeros((HEIGHT * SCALE, WIDTH * SCALE, 4), dtype=np.uint8)
    rgba[mask, :3] = shade(x, y, z, normal, recessed)
    rgba[mask, 3] = 255
    return Image.fromarray(rgba)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path, help="Directory for the two gallery layers.")
    args = parser.parse_args()
    shell_image = bake(recessed=True)

    # The DOM positions the recess independently of the outer case and toolbar.
    shell_image.crop((44, 140, 836, 800)).save(
        args.output_dir / "pbr-recess.png", optimize=True
    )
    bake(recessed=False).save(args.output_dir / "pbr-shell.png", optimize=True)


if __name__ == "__main__":
    main()
