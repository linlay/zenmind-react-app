import { Text, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { AppScreenFrame } from './AppScreenFrame';

type PreviewCardProps = {
  iconUsage: AppIconUsage;
  eyebrow: string;
  title: string;
  body: string;
};

const PREVIEW_STACK_CLASS = 'border-t border-app-line';
const PREVIEW_CARD_CLASS = 'flex-row items-start gap-app-lg border-b border-app-line py-app-lg';
const PREVIEW_ICON_SHELL_CLASS = 'h-11 w-11 items-center justify-center rounded-app-pill bg-app-brand-blue-soft';
const PREVIEW_TEXT_BLOCK_CLASS = 'flex-1 gap-0.5 pt-0.5';
const PREVIEW_EYEBROW_CLASS = 'text-app-caption font-semibold text-app-brand-blue';
const PREVIEW_TITLE_CLASS = 'text-app-title-sm font-bold text-app-primary';
const PREVIEW_BODY_CLASS = 'text-[14px] leading-[21px] text-app-secondary';

function PreviewCard({ iconUsage, eyebrow, title, body }: PreviewCardProps) {
  return (
    <View className={PREVIEW_CARD_CLASS}>
      <View className={PREVIEW_ICON_SHELL_CLASS}>
        <AppIcon usage={iconUsage} />
      </View>

      <View className={PREVIEW_TEXT_BLOCK_CLASS}>
        <Text className={PREVIEW_EYEBROW_CLASS}>{eyebrow}</Text>
        <Text className={PREVIEW_TITLE_CLASS}>{title}</Text>
        <Text className={PREVIEW_BODY_CLASS}>{body}</Text>
      </View>
    </View>
  );
}

export function DriveScreen() {
  const t = useT();
  const { theme } = useAppTheme();

  return (
    <AppScreenFrame
      eyebrow={t('drive.eyebrow')}
      title={t('drive.title')}
      description={t('drive.description')}
      accentColor={theme.colors.brandBlue}
    >
      <View className={PREVIEW_STACK_CLASS}>
        <PreviewCard
          iconUsage="preview.driveFiles"
          eyebrow={t('drive.files.eyebrow')}
          title={t('drive.files.title')}
          body={t('drive.files.body')}
        />
        <PreviewCard
          iconUsage="preview.driveReference"
          eyebrow={t('drive.reference.eyebrow')}
          title={t('drive.reference.title')}
          body={t('drive.reference.body')}
        />
      </View>
    </AppScreenFrame>
  );
}
