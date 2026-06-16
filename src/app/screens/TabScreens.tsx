import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatHomeScreen } from '../../features/chatPersistence/ChatHomeScreen';
import { AgentTaskBoardScreen } from '../../features/agentTaskBoard/AgentTaskBoardScreen';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { useT } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../shared/visual/foundation';
import { AppScreenFrame } from './AppScreenFrame';
import { MeScreen as MeAccountScreen } from './MeScreen';

type TabScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

function TabScreen(props: TabScreenProps) {
  const { theme } = useAppTheme();
  return <AppScreenFrame {...props} accentColor={theme.colors.brandBlue} />;
}

type PreviewCardProps = {
  iconUsage: AppIconUsage;
  eyebrow: string;
  title: string;
  body: string;
};

function PreviewCard({ iconUsage, eyebrow, title, body }: PreviewCardProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewIconShell}>
        <AppIcon usage={iconUsage} />
      </View>

      <View style={styles.previewTextBlock}>
        <Text style={styles.previewEyebrow}>{eyebrow}</Text>
        <Text style={styles.previewTitle}>{title}</Text>
        <Text style={styles.previewBody}>{body}</Text>
      </View>
    </View>
  );
}

export function ChatScreen() {
  return <ChatHomeScreen />;
}

export function TerminalScreen() {
  return <AgentTaskBoardScreen />;
}

export function MeScreen() {
  return <MeAccountScreen />;
}

export function DriveScreen() {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  return (
    <TabScreen eyebrow={t('drive.eyebrow')} title={t('drive.title')} description={t('drive.description')}>
      <View style={styles.previewStack}>
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
    </TabScreen>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    previewStack: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.line
    },
    previewCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: appVisualTokens.spacing.lg,
      paddingVertical: appVisualTokens.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    previewIconShell: {
      width: 44,
      height: 44,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.brandBlueSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    previewTextBlock: {
      flex: 1,
      gap: 2,
      paddingTop: 2
    },
    previewEyebrow: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.brandBlue
    },
    previewTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    previewBody: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary
    }
  });
}
