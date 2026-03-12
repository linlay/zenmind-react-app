import { useEffect, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DriveMount } from '../../../../../modules/drive/types';
import { DrivePalette } from '../types';
import styles from '../DriveContent.styles';

interface MenuPageProps {
  palette: DrivePalette;
  showHidden: boolean;
  mounts: DriveMount[];
  currentMountId: string;
  currentMount: DriveMount | null;
  onMountSelect: (mountId: string) => void;
  onRefresh: () => void;
  onToggleHidden: () => void;
  onOpenTasks: () => void;
  onOpenTrash: () => void;
}

export function MenuPage({
  palette,
  showHidden,
  mounts,
  currentMountId,
  currentMount,
  onMountSelect,
  onRefresh,
  onToggleHidden,
  onOpenTasks,
  onOpenTrash
}: MenuPageProps) {
  const insets = useSafeAreaInsets();
  const hasMounts = mounts.length > 0;
  const resolvedCurrentMountId = mounts.some((mount) => mount.id === currentMountId) ? currentMountId : '';
  const [mountPickerVisible, setMountPickerVisible] = useState(false);
  const [pendingMountId, setPendingMountId] = useState(resolvedCurrentMountId);
  const pendingMount = mounts.find((mount) => mount.id === pendingMountId) ?? null;

  useEffect(() => {
    if (!mountPickerVisible) {
      setPendingMountId(resolvedCurrentMountId);
    }
  }, [mountPickerVisible, resolvedCurrentMountId]);

  const closeMountPicker = () => {
    if (pendingMountId && pendingMountId !== currentMountId) {
      onMountSelect(pendingMountId);
    }
    setMountPickerVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        onPress={() => {
          if (mountPickerVisible) {
            closeMountPicker();
            return;
          }
          setPendingMountId(resolvedCurrentMountId);
          setMountPickerVisible(true);
        }}
      >
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>切换挂载目录</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>
            当前：{currentMount ? `${currentMount.name} (${currentMount.id})` : '未选择'}
          </Text>
        </View>
        <View style={[styles.menuBubbleTrigger, { backgroundColor: palette.primarySoft }]}>
          <Text style={[styles.menuBubbleTriggerText, { color: palette.primaryDeep }]}>
            {mountPickerVisible ? '收起' : '选择'}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal transparent visible={mountPickerVisible} animationType="fade" onRequestClose={closeMountPicker}>
        <View style={styles.bottomSheetOverlay}>
          <Pressable
            style={[styles.bottomSheetMask, { backgroundColor: palette.overlay }]}
            onPress={closeMountPicker}
          />

          <View
            style={[
              styles.bottomSheetCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
                paddingBottom: Math.max(insets.bottom, 14) + 8
              }
            ]}
          >
            <View style={[styles.bottomSheetHandle, { backgroundColor: palette.cardBorder }]} />

            <View style={styles.bottomSheetHeader}>
              <View style={styles.bottomSheetHeaderMain}>
                <Text style={[styles.bottomSheetTitle, { color: palette.text }]}>切换挂载目录</Text>
                <Text style={[styles.bottomSheetMeta, { color: palette.textSoft }]}>
                  {hasMounts ? '先选择挂载目录，关闭弹窗后再统一应用切换。' : '请先在服务端配置至少一个挂载目录。'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.82}
                style={[styles.bottomSheetCloseBtn, { backgroundColor: palette.primarySoft }]}
                onPress={closeMountPicker}
              >
                <Text style={[styles.bottomSheetCloseText, { color: palette.primaryDeep }]}>关闭</Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.menuPickerField,
                {
                  backgroundColor: palette.pageBg,
                  borderColor: hasMounts ? palette.cardBorder : palette.primarySoft
                }
              ]}
            >
              <Picker
                enabled={hasMounts}
                mode="dropdown"
                selectedValue={pendingMountId}
                dropdownIconColor={palette.primaryDeep}
                style={[styles.menuPicker, { color: hasMounts ? palette.text : palette.textSoft }]}
                itemStyle={[styles.menuPickerItem, { color: palette.text }]}
                onValueChange={(mountId) => {
                  if (typeof mountId !== 'string' || !mountId) {
                    return;
                  }
                  setPendingMountId(mountId);
                }}
              >
                {!hasMounts ? <Picker.Item label="暂无可用挂载目录" value="" /> : null}
                {hasMounts && !pendingMountId ? <Picker.Item label="请选择挂载目录" value="" /> : null}
                {mounts.map((mount) => (
                  <Picker.Item
                    key={mount.id}
                    label={mount.name === mount.id ? mount.name : `${mount.name} (${mount.id})`}
                    value={mount.id}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        onPress={onRefresh}
      >
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>刷新当前目录</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>重新拉取当前挂载点与目录内容</Text>
        </View>
        <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>执行</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        onPress={onToggleHidden}
      >
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>显示隐藏文件</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>
            当前状态：{showHidden ? '已显示' : '已隐藏'}
          </Text>
        </View>
        <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>{showHidden ? '关闭' : '开启'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        onPress={onOpenTasks}
      >
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>查看传输任务</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>上传与打包下载的任务状态都在这里</Text>
        </View>
        <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.82}
        style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        onPress={onOpenTrash}
      >
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>查看垃圾桶</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>恢复误删文件，或彻底删除历史条目</Text>
        </View>
        <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>进入</Text>
      </TouchableOpacity>
    </>
  );
}
