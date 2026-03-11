import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { DriveMount } from '../../../../../modules/drive/types';
import { openDriveTasks, openDriveTrash } from '../../../../../modules/drive/state/driveSlice';
import { useAppDispatch } from '../../../../store/hooks';
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
}

export function MenuPage({
  palette,
  showHidden,
  mounts,
  currentMountId,
  currentMount,
  onMountSelect,
  onRefresh,
  onToggleHidden
}: MenuPageProps) {
  const dispatch = useAppDispatch();
  const [mountPickerOpen, setMountPickerOpen] = useState(false);

  return (
    <>
      {/* 挂载点切换 Picker */}
      <View style={[styles.menuRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <View style={styles.menuRowTextWrap}>
          <Text style={[styles.menuRowTitle, { color: palette.text }]}>切换挂载目录</Text>
          <Text style={[styles.menuRowDesc, { color: palette.textSoft }]}>当前：{currentMount?.name || '未选择'}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.78} onPress={() => setMountPickerOpen((prev) => !prev)}>
          <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>
            {mountPickerOpen ? '收起' : '选择'}
          </Text>
        </TouchableOpacity>
      </View>

      {mountPickerOpen
        ? mounts.map((mount) => {
            const active = mount.id === currentMountId;
            return (
              <TouchableOpacity
                key={mount.id}
                activeOpacity={0.82}
                style={[
                  styles.menuRow,
                  {
                    backgroundColor: active ? palette.primarySoft : palette.cardBg,
                    borderColor: active ? palette.primary : palette.cardBorder,
                    marginLeft: 16
                  }
                ]}
                onPress={() => {
                  onMountSelect(mount.id);
                  setMountPickerOpen(false);
                }}
              >
                <View style={styles.menuRowTextWrap}>
                  <Text style={[styles.menuRowTitle, { color: active ? palette.primaryDeep : palette.text }]}>
                    {mount.name}
                  </Text>
                  <Text style={[styles.menuRowDesc, { color: palette.textMute }]}>{mount.id}</Text>
                </View>
                {active ? <Text style={[styles.menuRowAction, { color: palette.primaryDeep }]}>当前</Text> : null}
              </TouchableOpacity>
            );
          })
        : null}

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
        onPress={() => dispatch(openDriveTasks())}
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
        onPress={() => dispatch(openDriveTrash())}
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
