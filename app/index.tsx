import { Loading } from '@/components/ui';
import { applyLanguage, Language } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Href, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

/** Entry point: decides where the user goes (sign-in, onboarding, partner area or landlord area). */
export default function Index() {
  const { session, loading } = useSession();
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('apartment_id, role, apartments(language)')
        .eq('user_id', session.user.id)
        .is('left_at', null)
        .order('joined_at', { ascending: false });
      if (error) throw error;

      // TODO (week 1): let a user with several apartments pick one; for now take the latest.
      const partner = data.find((m) => m.role === 'partner');
      if (partner) {
        const apt = partner.apartments as unknown as { language: Language } | null;
        if (apt) await applyLanguage(apt.language);
        setTarget({ pathname: '/(partner)/[aptId]', params: { aptId: partner.apartment_id } });
      } else if (data.some((m) => m.role === 'landlord')) {
        setTarget('/(landlord)');
      } else {
        setTarget('/(auth)/apartment');
      }
    })();
  }, [session]);

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!target) return <Loading />;
  return <Redirect href={target} />;
}
