/**
 * E-mail one-time-code sign-in, as a small state machine. The only service
 * access for the sign-in screen. Copy is chosen here from the error code:
 * raw service messages are never shown.
 */
import { useState } from 'react';
import { toAppError } from '@/core/errors';
import { useServices } from '@/services/ServiceProvider';

export type SignInStep = 'email' | 'code';

export interface SignInState {
  step: SignInStep;
  email: string;
  code: string;
  busy: boolean;
  message: string | null;
  setEmail: (v: string) => void;
  setCode: (v: string) => void;
  requestCode: () => Promise<void>;
  verify: () => Promise<void>;
  startOver: () => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useSignIn(onSignedIn: () => void): SignInState {
  const { auth } = useServices();
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requestCode = async () => {
    if (!EMAIL.test(email.trim())) {
      setMessage('Please enter the e-mail address on your reservation.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { challengeId: id } = await auth.signInWithOtp(email.trim());
      setChallengeId(id);
      setCode('');
      setStep('code');
    } catch (e) {
      setMessage(toAppError(e).code === 'validation' ? 'Please enter the e-mail address on your reservation.' : 'We couldn’t send a code just now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challengeId) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setMessage('The code is six digits.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await auth.verifyOtp(challengeId, code.trim());
      onSignedIn();
    } catch (e) {
      const c = toAppError(e).code;
      setMessage(
        c === 'validation'
          ? 'That code didn’t work. Please check it, or ask for a new one.'
          : c === 'forbidden'
            ? 'We couldn’t find a voyage for this address. Your concierge will gladly help.'
            : 'We couldn’t sign you in just now. Please try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setStep('email');
    setCode('');
    setChallengeId(null);
    setMessage(null);
  };

  return { step, email, code, busy, message, setEmail, setCode, requestCode, verify, startOver };
}
