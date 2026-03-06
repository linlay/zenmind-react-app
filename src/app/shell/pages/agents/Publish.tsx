import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useEffect } from 'react';

import { styles as shellStyles } from '../../ShellScreen.styles';

import { styles } from './index.styles';
import { AgentsRouteBridgeProps, AgentsRouteScreenProps } from './types';

export function AgentsPublishRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: AgentsRouteScreenProps<'AgentsPublish'> & AgentsRouteBridgeProps) {
  const theme = runtime.theme;

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('AgentsPublish');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  const closePublish = () => {
    runtime.onClosePublish();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('AgentsList');
  };

  const submitPublish = () => {
    runtime.onSubmitPublish();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('AgentsList');
  };

  return (
    <View
      style={[
        styles.publishPage,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1
        }
      ]}
      testID="agents-publish-page"
    >
      <View style={[shellStyles.publishHead, { borderBottomColor: theme.border }]}>
        <View style={shellStyles.publishTitleWrap}>
          <Text style={[shellStyles.publishTitle, { color: theme.text }]}>发布中心</Text>
          <Text style={[shellStyles.publishSubTitle, { color: theme.textMute }]} numberOfLines={2}>
            {runtime.selectedAgentKey ? `当前智能体：${runtime.selectedAgentKey}` : '请先选择智能体，然后发起发布。'}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.78}
          style={[shellStyles.publishCloseBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
          onPress={closePublish}
          testID="shell-publish-close-btn"
        >
          <Text style={[shellStyles.publishCloseText, { color: theme.textSoft }]}>关闭</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={shellStyles.publishScroll} contentContainerStyle={shellStyles.publishContent}>
        <View style={[shellStyles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
          <Text style={[shellStyles.publishSectionTitle, { color: theme.text }]}>发布目标</Text>
          <View style={shellStyles.publishChipRow}>
            {['内部频道', '变更公告页', '测试环境'].map((item) => (
              <View
                key={item}
                style={[shellStyles.publishChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={[shellStyles.publishChipText, { color: theme.textSoft }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[shellStyles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
          <Text style={[shellStyles.publishSectionTitle, { color: theme.text }]}>发布说明</Text>
          <Text style={[shellStyles.publishSectionBody, { color: theme.textSoft }]}>
            本次发布会同步当前智能体配置、默认提示词和会话能力开关。建议先在测试环境验证 5 分钟后再推送到团队频道。
          </Text>
        </View>

        <View style={[shellStyles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
          <Text style={[shellStyles.publishSectionTitle, { color: theme.text }]}>发布清单</Text>
          <View style={shellStyles.publishChecklist}>
            {['配置校验已通过', '变更摘要已生成', '回滚方案已就绪'].map((item) => (
              <View key={item} style={shellStyles.publishChecklistItem}>
                <Text style={[shellStyles.publishChecklistDot, { color: theme.primaryDeep }]}>•</Text>
                <Text style={[shellStyles.publishChecklistText, { color: theme.textSoft }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[shellStyles.publishFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          activeOpacity={0.76}
          style={[shellStyles.publishGhostBtn, { backgroundColor: theme.surfaceStrong }]}
          onPress={closePublish}
          testID="shell-publish-cancel-btn"
        >
          <Text style={[shellStyles.publishGhostText, { color: theme.textSoft }]}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.82}
          style={[shellStyles.publishPrimaryBtn, { backgroundColor: theme.primary }]}
          testID="shell-publish-submit-btn"
          onPress={submitPublish}
        >
          <Text style={shellStyles.publishPrimaryText}>确认发布</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
