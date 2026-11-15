// Tone of an `InlineNotice`. The skin is monochrome (plus `--hot` for errors), so tones differ by
// glyph, outline and the words — never by colour alone.
export const noticeTones = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const
export type NoticeTone = (typeof noticeTones)[keyof typeof noticeTones]
