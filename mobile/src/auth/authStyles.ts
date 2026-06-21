/**
 * Shared styles for the native auth + profile screens (accounts pivot). The RN
 * parallel of web `src/auth/AuthScreens.css` — one on-brand, token-driven sheet so
 * the login, profile-creation, and /you screens look consistent with the feed
 * ({@link ../feed/templates/tokens}). Dark, centered, card-on-page layout.
 */
import { StyleSheet } from 'react-native';

import {
  colors,
  fontSize,
  fontWeight,
  PAGE_BACKGROUND,
  radius,
  space,
  TAP_TARGET_MIN,
} from '../feed/templates/tokens';

export const authStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  brand: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    textAlign: 'center',
    marginBottom: space.md,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: space.xl,
  },
  providers: {
    gap: space.md,
  },
  providerBtn: {
    minHeight: TAP_TARGET_MIN,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  providerBtnPressed: {
    backgroundColor: colors.surfacePressed,
  },
  providerBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  primaryBtn: {
    minHeight: TAP_TARGET_MIN,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  primaryBtnPressed: {
    backgroundColor: colors.accentDeep,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: colors.accentContrast,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  note: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: space.md,
  },
  divider: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginVertical: space.lg,
  },
  field: {
    marginTop: space.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: space.xs,
  },
  input: {
    minHeight: TAP_TARGET_MIN,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: space.md,
  },
  hint: {
    color: colors.textFaint,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
  success: {
    color: colors.success,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: space.md,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: space.md,
  },
});
