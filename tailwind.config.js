const plugin = require('tailwindcss/plugin');

const foundationTokens = require('./src/shared/visual/foundation.tokens.json');

const APP_COLOR_ALIASES = {
  'brand-blue': 'brandBlue',
  'brand-blue-strong': 'brandBlueStrong',
  'brand-blue-soft': 'brandBlueSoft',
  action: 'brandBlueAction',
  'on-action': 'onBrandBlueAction',
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  line: 'line',
  'line-strong': 'lineStrong',
  surface: 'surface',
  'surface-muted': 'surfaceMuted',
  'surface-raised': 'surfaceRaised',
  background: 'background',
  'background-muted': 'backgroundMuted',
  badge: 'badge',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  'danger-soft': 'dangerSoft',
  'danger-line': 'dangerLine',
  overlay: 'overlay',
  shadow: 'shadow'
};

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function toPxTokenEntries(tokens) {
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`app-${toKebabCase(key)}`, `${value}px`]));
}

function toFontSizeEntries(tokens) {
  return Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      `app-${toKebabCase(key)}`,
      [`${value.fontSize}px`, { lineHeight: `${value.lineHeight}px` }]
    ])
  );
}

function parseColor(value) {
  const hexMatch = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (hexMatch) {
    return {
      rgb: `${Number.parseInt(hexMatch[1], 16)} ${Number.parseInt(hexMatch[2], 16)} ${Number.parseInt(hexMatch[3], 16)}`
    };
  }

  const rgbaMatch = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/i.exec(value);
  if (rgbaMatch) {
    return {
      rgb: `${rgbaMatch[1]} ${rgbaMatch[2]} ${rgbaMatch[3]}`,
      alpha: rgbaMatch[4]
    };
  }

  throw new Error(`Unsupported app visual color: ${value}`);
}

function colorVariableName(alias) {
  return `--color-app-${alias}`;
}

function toColorVariables(colors) {
  return Object.fromEntries(
    Object.entries(APP_COLOR_ALIASES).flatMap(([alias, tokenKey]) => {
      const variable = colorVariableName(alias);
      const parsed = parseColor(colors[tokenKey]);
      const entries = [[variable, parsed.rgb]];
      if (parsed.alpha) {
        entries.push([`${variable}-alpha`, parsed.alpha]);
      }
      return entries;
    })
  );
}

function toSemanticColors() {
  return Object.fromEntries(
    Object.keys(APP_COLOR_ALIASES).map((alias) => {
      const variable = colorVariableName(alias);
      const colorValue =
        alias === 'overlay'
          ? `rgb(var(${variable}) / var(${variable}-alpha))`
          : `rgb(var(${variable}) / <alpha-value>)`;
      return [alias, colorValue];
    })
  );
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        app: toSemanticColors()
      },
      spacing: toPxTokenEntries(foundationTokens.spacing),
      borderRadius: toPxTokenEntries(foundationTokens.radii),
      fontSize: toFontSizeEntries(foundationTokens.fontSizes)
    }
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': toColorVariables(foundationTokens.colors.light),
        '.dark:root': toColorVariables(foundationTokens.colors.dark)
      });
    })
  ]
};
