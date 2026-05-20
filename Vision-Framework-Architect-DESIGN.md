---
version: "alpha"
name: "Vision Framework Architect"
description: "Vision Framework Dashboard Section is designed for demonstrating application workflows and interface hierarchy. Key features include clear information density, modular panels, and interface rhythm. It is suitable for product showcases, admin panels, and analytics experiences."
colors:
  primary: "#00F0FF"
  secondary: "#000000"
  tertiary: "#0A45FF"
  neutral: "#000000"
  background: "#000000"
  surface: "#FFFFFF"
  text-primary: "#FFFFFF"
  text-secondary: "#000000"
  border: "#FFFFFF"
  accent: "#00F0FF"
typography:
  headline-lg:
    fontFamily: "Roboto"
    fontSize: "34px"
    fontWeight: 300
    lineHeight: "37.4px"
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: "Roboto"
    fontSize: "12px"
    fontWeight: 300
    lineHeight: "19.5px"
  label-md:
    fontFamily: "Roboto"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: "15px"
    letterSpacing: "0.25px"
rounded:
  full: "9999px"
spacing:
  base: "4px"
  sm: "1px"
  md: "2px"
  lg: "3.4px"
  xl: "4px"
  gap: "6px"
  card-padding: "9px"
  section-padding: "24px"
components:
  button-primary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "6px"
  button-link:
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: "6px"
  card:
    rounded: "23px"
    padding: "20px"
---

## Overview

- **Composition cues:**
  - Layout: Flex
  - Content Width: Bounded
  - Framing: Glassy
  - Grid: Minimal

## Colors

The color system uses dark mode with #00F0FF as the main accent and #000000 as the neutral foundation.

- **Primary (#00F0FF):** Main accent and emphasis color.
- **Secondary (#000000):** Supporting accent for secondary emphasis.
- **Tertiary (#0A45FF):** Reserved accent for supporting contrast moments.
- **Neutral (#000000):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #000000; Surface: #FFFFFF; Text Primary: #FFFFFF; Text Secondary: #000000; Border: #FFFFFF; Accent: #00F0FF

- **Gradients:** bg-gradient-to-br from-white/30 to-transparent via-white/5, bg-gradient-to-b from-black/40 to-[#4A5452]/90 via-black/10, bg-gradient-to-t from-black/80 to-transparent via-transparent, bg-gradient-to-br from-white/40 to-white/10 via-white/5

## Typography

Typography relies on Roboto across display, body, and utility text.

- **Headlines (`headline-lg`):** Roboto, 34px, weight 300, line-height 37.4px, letter-spacing -0.025em.
- **Body (`body-md`):** Roboto, 12px, weight 300, line-height 19.5px.
- **Labels (`label-md`):** Roboto, 10px, weight 500, line-height 15px, letter-spacing 0.25px.

## Layout

Layout follows a flex composition with reusable spacing tokens. Preserve the flex, bounded structural frame before changing ornament or component styling. Use 4px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a flex / bounded composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Flex
- **Content width:** Bounded
- **Base unit:** 4px
- **Scale:** 1px, 2px, 3.4px, 4px, 6px, 6.8px, 8px, 12px
- **Section padding:** 24px, 64px
- **Card padding:** 9px, 16px, 20px
- **Gaps:** 6px, 12px, 16px

## Elevation & Depth

Depth is communicated through glass, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as glass first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Glass
- **Borders:** 1px #FFFFFF
- **Shadows:** rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(255, 255, 255) 0px 0px 0px 12px, rgba(0, 0, 0, 0.15) 0px 30px 60px 0px; rgb(255, 255, 255) 0px 0px 0px 0px, rgba(255, 255, 255, 0.3) 0px 0px 0px 1px, rgba(0, 0, 0, 0) 0px 0px 0px 0px; rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.2) 0px 25px 50px -12px
- **Blur:** 12px, 24px, 40px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 0px padding and a 0px radius. Drive the shell with linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1), rgba(74, 84, 82, 0.9)) so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes rely on a tight radius system anchored by 19px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 19px, 20px, 23px, 24px, 48px, 9999px
- **Icon treatment:** Linear
- **Icon sets:** Solar

## Components

Anchor interactions to the detected button styles. Reuse the existing card surface recipe for content blocks.

### Buttons
- **Primary:** background #FFFFFF, text #000000, radius 9999px, padding 6px, border 0px solid rgb(229, 231, 235).
- **Links:** text #FFFFFF, radius 9999px, padding 6px, border 0px solid rgb(229, 231, 235).

### Cards and Surfaces
- **Card surface:** background rgba(0, 0, 0, 0.1), border 0px solid rgb(229, 231, 235), radius 23px, padding 20px, shadow none, blur 40px.

### Iconography
- **Treatment:** Linear.
- **Sets:** Solar.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 4px rhythm.
- Do reuse the Glass surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 19px, 20px, 23px, 24px, 48px, 9999px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected moderate motion intensity without a deliberate reason.

## Motion

Motion feels controlled and interface-led across text, layout, and section transitions. Timing clusters around 150ms and 300ms. Easing favors ease and cubic-bezier(0.4. Hover behavior focuses on opacity and color changes. Scroll choreography uses GSAP ScrollTrigger for section reveals and pacing.

**Motion Level:** moderate

**Durations:** 150ms, 300ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

**Hover Patterns:** opacity, color, transform

**Scroll Patterns:** gsap-scrolltrigger
