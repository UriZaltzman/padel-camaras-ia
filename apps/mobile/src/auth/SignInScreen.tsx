import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@app/config/brand';
import type { Schema } from '@app/contracts';
import { Button, Card, nativeTextStyle } from '@app/ui/native';
import { theme } from '@app/ui/tokens';

import { useApi } from '../api/client';
import { fonts } from '../theme/fonts';
import { currentConsent } from './consent';
import { toE164 } from './phone';
import { ProviderCancelledError } from './providers';
import { useSession } from './session';

const colors = theme.light;

type Step = 'phone' | 'code' | 'terms';
type Consent = Schema<'SignUpConsent'>;
type ApiError = Schema<'Error'>;
/** One sign-in attempt; called again with consent after 403 TERMS_NOT_ACCEPTED. */
type Attempt = (
  consent?: Consent,
) => Promise<{ data?: Schema<'AuthSession'>; error?: ApiError | undefined }>;

const knownErrors = new Set([
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
]);

export function SignInScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const { startSession, providers } = useSession();

  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const pending = useRef<{ attempt: Attempt; back: Step } | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  function describe(err: ApiError | undefined): string {
    if (!err) return t('signIn.errors.generic');
    if (err.code === 'OTP_INVALID') {
      const left = Number(err.details?.attempts_remaining ?? 0);
      return t('signIn.errors.OTP_INVALID', { count: left });
    }
    return knownErrors.has(err.code) ? t(`signIn.errors.${err.code}`) : t('signIn.errors.generic');
  }

  async function run(attempt: Attempt, back: Step, consent?: Consent) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await attempt(consent);
      if (data) {
        pending.current = null;
        await startSession(data);
        return;
      }
      if (err?.code === 'TERMS_NOT_ACCEPTED') {
        pending.current = { attempt, back };
        setAccepted(false);
        setStep('terms');
        return;
      }
      setError(describe(err));
      if (step === 'terms') setStep(back);
    } catch {
      setError(t('signIn.errors.network'));
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(target: string) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await api.POST('/auth/otp/whatsapp', {
        body: { phone: target },
      });
      if (!data) {
        setError(describe(err));
        return;
      }
      setPhone(target);
      setCode('');
      setResendIn(data.resend_after_seconds);
      setStep('code');
    } catch {
      setError(t('signIn.errors.network'));
    } finally {
      setBusy(false);
    }
  }

  function onSendCode() {
    const target = toE164(phoneInput);
    if (!target) {
      setError(t('signIn.errors.phoneInvalid'));
      return;
    }
    void requestCode(target);
  }

  function onVerify() {
    const value = code;
    const attempt: Attempt = (consent) =>
      api.POST('/auth/otp/verify', { body: { phone, code: value, consent } });
    void run(attempt, 'code');
  }

  function onProvider(kind: 'google' | 'apple') {
    const back = step;
    void (async () => {
      let token;
      try {
        token = await providers[kind]();
      } catch (e) {
        if (!(e instanceof ProviderCancelledError)) setError(t('signIn.errors.provider'));
        return;
      }
      const attempt: Attempt =
        kind === 'google'
          ? (consent) =>
              api.POST('/auth/oauth/google', {
                body: { id_token: token.idToken, nonce: token.nonce, consent },
              })
          : (consent) =>
              api.POST('/auth/oauth/apple', {
                body: {
                  id_token: token.idToken,
                  nonce: token.nonce,
                  full_name: token.fullName,
                  consent,
                },
              });
      await run(attempt, back);
    })();
  }

  function onAcceptTerms() {
    if (!pending.current) return;
    void run(pending.current.attempt, pending.current.back, currentConsent);
  }

  const legalUrl = (path: string) => `https://${brand.domain}/${path}`;

  return (
    <SafeAreaView style={styles.screen} testID="sign-in-screen">
      <View style={styles.content}>
        <Text style={styles.title}>{t(`signIn.${step}.title`)}</Text>
        <Text style={styles.body}>
          {step === 'code' ? t('signIn.code.body', { phone }) : t(`signIn.${step}.body`)}
        </Text>

        {step === 'phone' && (
          <>
            <TextInput
              testID="phone-input"
              accessibilityLabel={t('signIn.phone.label')}
              placeholder={t('signIn.phone.placeholder')}
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phoneInput}
              onChangeText={setPhoneInput}
              style={styles.input}
            />
            <Button
              testID="send-code"
              label={t('signIn.phone.submit')}
              onPress={onSendCode}
              disabled={busy || !phoneInput.trim()}
            />
            <Text style={styles.divider}>{t('signIn.or')}</Text>
            <Button
              testID="google-sign-in"
              variant="secondary"
              label={t('signIn.google')}
              onPress={() => onProvider('google')}
              disabled={busy}
            />
            <Button
              testID="apple-sign-in"
              variant="secondary"
              label={t('signIn.apple')}
              onPress={() => onProvider('apple')}
              disabled={busy}
            />
          </>
        )}

        {step === 'code' && (
          <>
            <TextInput
              testID="code-input"
              accessibilityLabel={t('signIn.code.label')}
              placeholder={t('signIn.code.placeholder')}
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              style={[styles.input, styles.codeInput]}
            />
            <Button
              testID="verify-code"
              label={t('signIn.code.submit')}
              onPress={onVerify}
              disabled={busy || code.length !== 6}
            />
            <Button
              testID="resend-code"
              variant="secondary"
              label={
                resendIn > 0
                  ? t('signIn.code.resendIn', { seconds: resendIn })
                  : t('signIn.code.resend')
              }
              onPress={() => void requestCode(phone)}
              disabled={busy || resendIn > 0}
            />
            <Pressable
              accessibilityRole="button"
              testID="change-phone"
              onPress={() => {
                setError(null);
                setStep('phone');
              }}
            >
              <Text style={styles.link}>{t('signIn.code.changePhone')}</Text>
            </Pressable>
          </>
        )}

        {step === 'terms' && (
          <>
            <Card>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted }}
                testID="accept-terms-checkbox"
                onPress={() => setAccepted((a) => !a)}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, accepted && styles.checkboxOn]} />
                <Text style={styles.checkText}>{t('signIn.terms.checkbox')}</Text>
              </Pressable>
              <View style={styles.links}>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(legalUrl('terminos'))}
                >
                  <Text style={styles.link}>{t('signIn.terms.readTerms')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(legalUrl('privacidad'))}
                >
                  <Text style={styles.link}>{t('signIn.terms.readPrivacy')}</Text>
                </Pressable>
              </View>
            </Card>
            <Button
              testID="accept-terms"
              label={t('signIn.terms.submit')}
              onPress={onAcceptTerms}
              disabled={busy || !accepted}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(pending.current?.back ?? 'phone')}
            >
              <Text style={styles.link}>{t('signIn.terms.back')}</Text>
            </Pressable>
          </>
        )}

        {error && (
          <Text accessibilityRole="alert" testID="sign-in-error" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24 },
  content: { flex: 1, justifyContent: 'center', gap: 12 },
  title: {
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    letterSpacing: 32 * -0.02,
    color: colors.text,
  },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  input: {
    ...nativeTextStyle({
      role: 'body',
      weight: 400,
      fontSize: 18,
      letterSpacingEm: 0,
      uppercase: false,
    }),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
  },
  codeInput: { fontFamily: fonts.monoMedium, fontSize: 24, letterSpacing: 8 },
  divider: { fontFamily: fonts.monoMedium, textAlign: 'center', color: colors.textTertiary },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.primary, paddingVertical: 4 },
  links: { marginTop: 12, gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  checkboxOn: { backgroundColor: colors.primary },
  checkText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
  error: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.danger },
});
