---
name: Standard Modern Mobile
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#414755'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#717786'
  outline-variant: '#c1c6d7'
  surface-tint: '#005bc1'
  primary: '#0058bc'
  on-primary: '#ffffff'
  primary-container: '#0070eb'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#4c4aca'
  on-secondary: '#ffffff'
  secondary-container: '#6664e4'
  on-secondary-container: '#fffbff'
  tertiary: '#9e3d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c64f00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c2c1ff'
  on-secondary-fixed: '#0c006a'
  on-secondary-fixed-variant: '#3631b4'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb595'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7c2e00'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 41px
    letterSpacing: -0.5px
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0px
  headline-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.4px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.4px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.2px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 13px
    letterSpacing: 0.06rem
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  margin-mobile: 1rem
  gutter-mobile: 0.75rem
  stack-xs: 0.25rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
  header-height: 56px
  tabbar-height: 83px
---

## Brand & Style

This design system is built for high-utility mobile applications where speed, clarity, and ease of use are paramount. The brand personality is professional, reliable, and unobtrusive, allowing user content to remain the focus.

The aesthetic follows a **Modern Corporate** approach, blending the efficiency of Apple’s Human Interface Guidelines with the systematic structure of modern SaaS. It utilizes a primarily flat design language, punctuated by intentional whitespace and subtle depth cues to guide the user's eye through complex tasks without visual fatigue.

## Colors

The palette is centered around a high-visibility primary blue, optimized for accessibility and action signaling.

- **Primary Blue (#007AFF):** Reserved for interactive elements, primary buttons, and active states.
- **Surface Colors:** Use pure white (#FFFFFF) for primary content cards and containers. Use light gray (#F2F2F7) for global page backgrounds to create a subtle contrast that makes white containers "pop."
- **Functional Grays:** Use a scale of grays for hierarchy—darker for primary text, medium for secondary labels, and light for borders and dividers.

## Typography

The design system utilizes **Inter** for its exceptional legibility on mobile screens. The scale is designed to create a clear vertical rhythm.

- **Headlines:** Use `display-lg` for top-level page titles that collapse into `headline-sm` within a sticky header upon scrolling.
- **Body:** `body-lg` is the standard for long-form text, while `body-md` is used for secondary information or dense lists.
- **Labels:** `label-sm` should be used for overlines or small metadata, often paired with increased letter spacing for readability at small sizes.

## Layout & Spacing

The layout follows a **Fluid Mobile Grid** with a baseline 4px/8px rhythm.

- **Margins:** A standard 16px (1rem) margin is applied to the left and right of the screen.
- **Safe Areas:** Adhere strictly to device safe areas for the header and tab bar to ensure no overlap with hardware notches or home indicators.
- **Vertical Spacing:** Use `stack-md` (16px) for separating logical sections and `stack-sm` (8px) for related elements within a group.

## Elevation & Depth

This design system uses **Tonal Layering** supplemented by **Ambient Shadows**.

- **Level 0 (Base):** The `background_secondary` color (#F2F2F7) acts as the canvas.
- **Level 1 (Card):** White surfaces used for content modules. They should have a subtle 1px border (#E5E5EA) or a soft, low-opacity shadow (0px 2px 8px rgba(0,0,0,0.05)).
- **Level 2 (Floating/Sticky):** Headers and Tab Bars. Use a backdrop-filter (blur: 20px) with a semi-transparent white background to create a "glass" effect that suggests they sit above the content.
- **Interactions:** Avoid heavy shadows on buttons; use a slight darkening of the color on press to simulate physical depression.

## Shapes

The shape language is consistently **Rounded**, reflecting a modern and friendly mobile feel.

- **Buttons & Cards:** Use a 10px - 12px corner radius (Rounded-LG) to provide a soft but structured appearance.
- **Inputs:** Use a 8px radius for text fields to maintain a professional look.
- **Icons:** Icons should utilize rounded caps and joins to match the outer radius of the UI components.

## Components

### Header

A sticky 56px height component. Center the title for high-level navigation or left-align it for detail views. Include `Primary Blue` text buttons for secondary actions (e.g., "Edit") and glyphs for primary actions (e.g., "+").

### Tab Bar

A fixed 83px height (including safe area) bottom bar. Icons should be 24pt. Use `Primary Blue` for the active state and `Neutral Gray` for inactive states. Use a thin 0.5pt divider line at the top.

### Buttons

- **Primary:** Solid `Primary Blue` fill with white text.
- **Secondary:** Light blue background (10% opacity) with `Primary Blue` text.
- **Min-height:** All interactive targets must be at least 44px to accommodate touch input.

### Inputs

Standardized text fields with a light gray stroke. On focus, the stroke should change to `Primary Blue`.

### Cards

White containers used to group related list items. Use the defined `Level 1` elevation. Cards should span the full width of the screen with a 1px bottom border for "List Style" or have 16px side margins for "Inset Grouped" styles.
