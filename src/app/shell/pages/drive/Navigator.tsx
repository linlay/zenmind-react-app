import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatError } from '../../../../core/network/apiClient';
import { showToast } from '../../../ui/uiSlice';
import { createDriveFolder } from '../../../../modules/drive/api/driveApi';
import { DriveEntry } from '../../../../modules/drive/types';
import {
  closeDriveDetail,
  openDriveBrowser,
  openDriveDetail,
  openDriveMenu,
  openDriveSearch,
  openDriveTasks,
  openDriveTrash,
  setDriveSelectionMode
} from '../../../../modules/drive/state/driveSlice';
import { ShellTabNavigation } from '../../types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { BrowserPage } from './components/BrowserPage';
import { CreateActionsSheet } from './components/CreateActionsSheet';
import { EntryActionsPage } from './components/EntryActionsPage';
import { FormPage } from './components/FormPage';
import { MenuPage } from './components/MenuPage';
import { MoveCopyPickerPage } from './components/MoveCopyPickerPage';
import { PlusIcon } from './components/Icons';
import { PreviewPage } from './components/PreviewPage';
import { SearchPage } from './components/SearchPage';
import { SelectionBar } from './components/SelectionBar';
import { TasksPage } from './components/TasksPage';
import { TrashPage } from './components/TrashPage';
import styles from './DriveContent.styles';
import {
  DriveFormPageState,
  DriveRouteBridgeProps,
  DriveRouteName,
  DriveRootNavigation,
  DriveRouteScreenProps,
  DriveStackParamList,
  ShellDriveTabScreenProps
} from './types';
import { buildTestID, dirnamePath, getSingleMountId, normalizeDirectory } from './utils';
import { useDriveController } from './useDriveController';

const Stack = createNativeStackNavigator<DriveStackParamList>();

type DriveController = ReturnType<typeof useDriveController>;

function resolveFormTitle(formPage: DriveFormPageState | null) {
  if (!formPage) {
    return '文件操作';
  }
  if (formPage.kind === 'create-folder') {
    return '新建目录';
  }
  if (formPage.kind === 'rename') {
    return '重命名';
  }
  if (formPage.kind === 'move') {
    return '移动到...';
  }
  if (formPage.kind === 'copy') {
    return '复制到...';
  }
  if (formPage.kind === 'delete') {
    return '删除确认';
  }
  return '打包下载';
}

function closeOperationAfterSuccess(navigation: DriveRootNavigation, routeName: DriveRouteName) {
  const routes = navigation.getState().routes;
  let popCount = 1;
  let previousIndex = routes.length - 2;

  while (previousIndex >= 0 && routes[previousIndex]?.name === routeName) {
    popCount += 1;
    previousIndex -= 1;
  }

  if (routes[previousIndex]?.name === 'DrivePreview' && routes.length >= popCount + 1) {
    navigation.pop(popCount + 1);
    return;
  }
  if (navigation.canGoBack()) {
    navigation.pop(popCount);
  }
}

function DriveScrollScene({
  ctrl,
  testIDPrefix,
  children
}: {
  ctrl: DriveController;
  testIDPrefix: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: ctrl.palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
      <ScrollView
        style={styles.listWrap}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 32, 40) }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

interface CommonDriveRouteProps {
  ctrl: DriveController;
  onBindNavigation?: (navigation: DriveRootNavigation) => void;
  onRouteFocus?: (routeName: DriveRouteName, params?: DriveStackParamList[DriveRouteName]) => void;
  testIDPrefix: string;
}

function DriveBrowserRouteScreen({
  navigation,
  route,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveBrowser'> & CommonDriveRouteProps) {
  const insets = useSafeAreaInsets();
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [pendingCreateAction, setPendingCreateAction] = useState<'upload' | 'create-folder' | null>(null);

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveBrowser', route.params)
  });

  useFocusEffect(
    useCallback(() => {
      const mountId = String(route.params?.mountId || '').trim();
      const path = normalizeDirectory(route.params?.path || '/');
      if (mountId) {
        ctrl.setCurrentMountId(mountId);
      }
      ctrl.setCurrentPath(path);
      ctrl.dispatch(closeDriveDetail());
      ctrl.dispatch(openDriveBrowser());
    }, [ctrl.dispatch, ctrl.setCurrentMountId, ctrl.setCurrentPath, route.params?.mountId, route.params?.path])
  );

  const selectionBarVisible = !ctrl.entryActionsPage && ctrl.driveSelectionMode && ctrl.selectedEntries.length > 0;
  const uploadFabVisible =
    !ctrl.entryActionsPage && !ctrl.driveSelectionMode && Boolean(ctrl.baseUrl) && Boolean(ctrl.currentMountId);
  const contentBottomPadding = selectionBarVisible
    ? Math.max(insets.bottom + 176, 196)
    : Math.max(insets.bottom + 32, 40);

  useEffect(() => {
    if (!uploadFabVisible) {
      setCreateSheetVisible(false);
      setPendingCreateAction(null);
    }
  }, [uploadFabVisible]);

  const openFormRoute = useCallback(() => {
    navigation.push('DriveForm');
  }, [navigation]);

  const handleDownloadEntries = useCallback(
    async (entries: DriveEntry[]) => {
      const result = await ctrl.handleDownloadEntries(entries);
      if (result === 'form') {
        openFormRoute();
      }
    },
    [ctrl.handleDownloadEntries, openFormRoute]
  );

  const openPreviewRoute = useCallback(
    (entry: DriveEntry) => {
      if (!ctrl.openPreviewPage(entry)) {
        return;
      }
      navigation.push('DrivePreview');
    },
    [ctrl.openPreviewPage, navigation]
  );

  const handleEntryPress = useCallback(
    (entry: DriveEntry) => {
      if (ctrl.driveSelectionMode) {
        ctrl.handleEntryPress(entry);
        return;
      }
      if (entry.isDir) {
        ctrl.navigateToDirectory(entry.mountId, entry.path);
        navigation.push('DriveBrowser', { mountId: entry.mountId, path: entry.path });
        return;
      }
      openPreviewRoute(entry);
    },
    [ctrl.driveSelectionMode, ctrl.handleEntryPress, ctrl.navigateToDirectory, navigation, openPreviewRoute]
  );

  const handleRename = useCallback(
    (entry: DriveEntry | null) => {
      if (!ctrl.openRenamePage(entry)) {
        return;
      }
      openFormRoute();
    },
    [ctrl.openRenamePage, openFormRoute]
  );

  const handleMoveCopy = useCallback(
    (kind: 'move' | 'copy', entries: DriveEntry[]) => {
      if (!ctrl.openMoveCopyPage(kind, entries)) {
        return;
      }
      const mountName = ctrl.mountMap[getSingleMountId(entries)]?.name;
      navigation.push('DriveMoveCopyPicker', { path: '/', mountName });
    },
    [ctrl.mountMap, ctrl.openMoveCopyPage, navigation]
  );

  const handleDelete = useCallback(
    (entries: DriveEntry[]) => {
      if (!ctrl.openDeletePage(entries)) {
        return;
      }
      openFormRoute();
    },
    [ctrl.openDeletePage, openFormRoute]
  );

  useEffect(() => {
    if (createSheetVisible || !pendingCreateAction) {
      return;
    }

    const timer = setTimeout(() => {
      if (pendingCreateAction === 'upload') {
        void ctrl.handlePickUploadFiles();
      } else if (ctrl.openCreateFolderPage()) {
        openFormRoute();
      }
      setPendingCreateAction(null);
    }, 240);

    return () => clearTimeout(timer);
  }, [createSheetVisible, ctrl.handlePickUploadFiles, ctrl.openCreateFolderPage, openFormRoute, pendingCreateAction]);

  return (
    <View style={[styles.page, { backgroundColor: ctrl.palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
      <BrowserPage
        testIDPrefix={testIDPrefix}
        palette={ctrl.palette}
        themeMode={ctrl.theme.mode}
        baseUrl={ctrl.baseUrl}
        hasMounts={ctrl.mounts.length > 0}
        mountsLoading={ctrl.mountsLoading}
        entriesLoading={ctrl.entriesLoading}
        browserError={ctrl.browserError}
        sortedEntries={ctrl.sortedEntries}
        driveSelectionMode={ctrl.driveSelectionMode}
        selectedEntries={ctrl.selectedEntries}
        mountMap={ctrl.mountMap}
        browserRefreshing={ctrl.browserRefreshing}
        contentBottomPadding={contentBottomPadding}
        onRefresh={() => void ctrl.loadBrowserEntries(true)}
        onRetry={() => void ctrl.loadBrowserEntries(false)}
        onEntryPress={handleEntryPress}
        onEntryLongPress={ctrl.handleEntryLongPress}
        onEntryMore={ctrl.openEntryActionsPage}
        onOpenTasks={() => navigation.navigate('DriveTasks')}
        onOpenTrash={() => navigation.navigate('DriveTrash')}
      />

      <EntryActionsPage
        palette={ctrl.palette}
        theme={ctrl.theme}
        entryActionsPage={ctrl.entryActionsPage}
        bottomInset={insets.bottom}
        onClose={ctrl.closeEntryActionsPage}
        onPreview={openPreviewRoute}
        onDownload={(entries) => void handleDownloadEntries(entries)}
        onRename={handleRename}
        onMoveCopy={handleMoveCopy}
        onDelete={handleDelete}
      />

      <CreateActionsSheet
        visible={createSheetVisible}
        palette={ctrl.palette}
        theme={ctrl.theme}
        bottomInset={insets.bottom}
        onClose={() => setCreateSheetVisible(false)}
        onSelectAction={(action) => {
          setPendingCreateAction(action);
          setCreateSheetVisible(false);
        }}
      />

      {uploadFabVisible ? (
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.uploadFab,
            {
              backgroundColor: ctrl.palette.primary,
              bottom: Math.max(insets.bottom + 74, 90)
            }
          ]}
          testID={buildTestID(testIDPrefix, 'create-fab')}
          onPress={() => setCreateSheetVisible(true)}
        >
          <PlusIcon color="#ffffff" />
        </TouchableOpacity>
      ) : null}

      {selectionBarVisible ? (
        <SelectionBar
          palette={ctrl.palette}
          theme={ctrl.theme}
          selectedEntries={ctrl.selectedEntries}
          selectedSingleEntry={ctrl.selectedSingleEntry}
          bottomInset={insets.bottom}
          onCancel={() => ctrl.dispatch(setDriveSelectionMode(false))}
          onDownload={(entries) => void handleDownloadEntries(entries)}
          onRename={handleRename}
          onMoveCopy={handleMoveCopy}
          onDelete={handleDelete}
        />
      ) : null}
    </View>
  );
}

function DriveSearchRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveSearch'> & CommonDriveRouteProps) {
  const insets = useSafeAreaInsets();

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveSearch')
  });

  useFocusEffect(
    useCallback(() => {
      ctrl.dispatch(closeDriveDetail());
      ctrl.dispatch(openDriveSearch());
    }, [ctrl.dispatch])
  );

  const handleDownloadEntries = useCallback(
    async (entries: DriveEntry[]) => {
      const result = await ctrl.handleDownloadEntries(entries);
      if (result === 'form') {
        navigation.push('DriveForm');
      }
    },
    [ctrl.handleDownloadEntries, navigation]
  );

  const openPreviewRoute = useCallback(
    (entry: DriveEntry) => {
      if (!ctrl.openPreviewPage(entry)) {
        return;
      }
      navigation.push('DrivePreview');
    },
    [ctrl.openPreviewPage, navigation]
  );

  const handleEntryPress = useCallback(
    (entry: DriveEntry) => {
      if (ctrl.driveSelectionMode) {
        ctrl.handleEntryPress(entry);
        return;
      }
      if (entry.isDir) {
        ctrl.navigateToDirectory(entry.mountId, entry.path);
        navigation.push('DriveBrowser', { mountId: entry.mountId, path: entry.path });
        return;
      }
      openPreviewRoute(entry);
    },
    [ctrl.driveSelectionMode, ctrl.handleEntryPress, ctrl.navigateToDirectory, navigation, openPreviewRoute]
  );

  const handleRename = useCallback(
    (entry: DriveEntry | null) => {
      if (!ctrl.openRenamePage(entry)) {
        return;
      }
      navigation.push('DriveForm');
    },
    [ctrl.openRenamePage, navigation]
  );

  const handleMoveCopy = useCallback(
    (kind: 'move' | 'copy', entries: DriveEntry[]) => {
      if (!ctrl.openMoveCopyPage(kind, entries)) {
        return;
      }
      const mountName = ctrl.mountMap[getSingleMountId(entries)]?.name;
      navigation.push('DriveMoveCopyPicker', { path: '/', mountName });
    },
    [ctrl.mountMap, ctrl.openMoveCopyPage, navigation]
  );

  const handleDelete = useCallback(
    (entries: DriveEntry[]) => {
      if (!ctrl.openDeletePage(entries)) {
        return;
      }
      navigation.push('DriveForm');
    },
    [ctrl.openDeletePage, navigation]
  );

  return (
    <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>
      <SearchPage
        testIDPrefix={testIDPrefix}
        palette={ctrl.palette}
        themeMode={ctrl.theme.mode}
        driveSearchQuery={ctrl.driveSearchQuery}
        searchLoading={ctrl.searchLoading}
        searchError={ctrl.searchError}
        sortedSearchResults={ctrl.sortedSearchResults}
        driveSelectionMode={ctrl.driveSelectionMode}
        selectedEntries={ctrl.selectedEntries}
        mountMap={ctrl.mountMap}
        onEntryPress={handleEntryPress}
        onEntryLongPress={ctrl.handleEntryLongPress}
        onEntryMore={ctrl.openEntryActionsPage}
      />
      <EntryActionsPage
        palette={ctrl.palette}
        theme={ctrl.theme}
        entryActionsPage={ctrl.entryActionsPage}
        bottomInset={insets.bottom}
        onClose={ctrl.closeEntryActionsPage}
        onPreview={openPreviewRoute}
        onDownload={(entries) => void handleDownloadEntries(entries)}
        onRename={handleRename}
        onMoveCopy={handleMoveCopy}
        onDelete={handleDelete}
      />
    </DriveScrollScene>
  );
}

function DriveMenuRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveMenu'> & CommonDriveRouteProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveMenu')
  });

  useFocusEffect(
    useCallback(() => {
      ctrl.dispatch(closeDriveDetail());
      ctrl.dispatch(openDriveMenu());
    }, [ctrl.dispatch])
  );

  return (
    <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>
      <MenuPage
        palette={ctrl.palette}
        showHidden={ctrl.showHidden}
        mounts={ctrl.mounts}
        currentMountId={ctrl.currentMountId}
        currentMount={ctrl.currentMount}
        onMountSelect={(mountId) => {
          ctrl.setCurrentMountId(mountId);
          ctrl.setCurrentPath('/');
          navigation.reset({
            index: 0,
            routes: [{ name: 'DriveBrowser', params: { mountId, path: '/' } }]
          });
        }}
        onRefresh={() => void ctrl.loadBrowserEntries(false)}
        onToggleHidden={() => ctrl.setShowHidden((prev) => !prev)}
        onOpenTasks={() => navigation.navigate('DriveTasks')}
        onOpenTrash={() => navigation.navigate('DriveTrash')}
      />
    </DriveScrollScene>
  );
}

function DriveTasksRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveTasks'> & CommonDriveRouteProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveTasks')
  });

  useFocusEffect(
    useCallback(() => {
      ctrl.dispatch(closeDriveDetail());
      ctrl.dispatch(openDriveTasks());
    }, [ctrl.dispatch])
  );

  return (
    <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>
      <TasksPage
        palette={ctrl.palette}
        theme={ctrl.theme}
        tasksLoading={ctrl.tasksLoading}
        tasksError={ctrl.tasksError}
        tasks={ctrl.tasks}
        onRefreshTask={(id) => void ctrl.handleRefreshSingleTask(id)}
        onDownloadTask={(task) => void ctrl.handleTaskDownload(task)}
        onDeleteTask={(id) => void ctrl.handleDeleteTask(id)}
      />
    </DriveScrollScene>
  );
}

function DriveTrashRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveTrash'> & CommonDriveRouteProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveTrash')
  });

  useFocusEffect(
    useCallback(() => {
      ctrl.dispatch(closeDriveDetail());
      ctrl.dispatch(openDriveTrash());
    }, [ctrl.dispatch])
  );

  return (
    <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>
      <TrashPage
        palette={ctrl.palette}
        theme={ctrl.theme}
        trashLoading={ctrl.trashLoading}
        trashError={ctrl.trashError}
        trashItems={ctrl.trashItems}
        onRestore={(id) => void ctrl.handleRestoreTrashItem(id)}
        onDelete={(id) => void ctrl.handleDeleteTrashItem(id)}
      />
    </DriveScrollScene>
  );
}

function DrivePreviewRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DrivePreview'> & CommonDriveRouteProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DrivePreview')
  });

  useFocusEffect(
    useCallback(() => {
      const entry = ctrl.previewPage?.entry;
      if (!entry) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
        return;
      }
      ctrl.dispatch(openDriveDetail({ mode: 'preview', title: entry.name || '文件详情' }));
    }, [ctrl.dispatch, ctrl.previewPage?.entry, navigation])
  );

  const handleDownloadEntries = useCallback(
    async (entries: DriveEntry[]) => {
      await ctrl.handleDownloadEntries(entries);
    },
    [ctrl.handleDownloadEntries]
  );

  const handleRename = useCallback(
    (entry: DriveEntry | null) => {
      if (!ctrl.openRenamePage(entry)) {
        return;
      }
      navigation.push('DriveForm');
    },
    [ctrl.openRenamePage, navigation]
  );

  const handleMoveCopy = useCallback(
    (kind: 'move' | 'copy', entries: DriveEntry[]) => {
      if (!ctrl.openMoveCopyPage(kind, entries)) {
        return;
      }
      const mountName = ctrl.mountMap[getSingleMountId(entries)]?.name;
      navigation.push('DriveMoveCopyPicker', { path: '/', mountName });
    },
    [ctrl.mountMap, ctrl.openMoveCopyPage, navigation]
  );

  const handleDelete = useCallback(
    (entries: DriveEntry[]) => {
      if (!ctrl.openDeletePage(entries)) {
        return;
      }
      navigation.push('DriveForm');
    },
    [ctrl.openDeletePage, navigation]
  );

  return (
    <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>
      {ctrl.previewPage ? (
        <PreviewPage
          palette={ctrl.palette}
          theme={ctrl.theme}
          previewPage={ctrl.previewPage}
          previewSourceUrl={ctrl.previewSourceUrl}
          markdownStyles={ctrl.markdownStyles}
          onDownload={(entries) => void handleDownloadEntries(entries)}
          onRename={handleRename}
          onMoveCopy={handleMoveCopy}
          onDelete={handleDelete}
        />
      ) : null}
    </DriveScrollScene>
  );
}

function DriveMoveCopyPickerRouteScreen({
  navigation,
  route,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveMoveCopyPicker'> & CommonDriveRouteProps) {
  const insets = useSafeAreaInsets();
  const pickerPath = normalizeDirectory(route.params?.path || '/');
  const pickerMountName = String(route.params?.mountName || '').trim();
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [createFolderValue, setCreateFolderValue] = useState('');
  const [createFolderSubmitting, setCreateFolderSubmitting] = useState(false);
  const [createFolderError, setCreateFolderError] = useState('');

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveMoveCopyPicker', { path: pickerPath, mountName: pickerMountName })
  });

  useFocusEffect(
    useCallback(() => {
      if (!ctrl.formPage || (ctrl.formPage.kind !== 'move' && ctrl.formPage.kind !== 'copy')) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
        return;
      }

      ctrl.dispatch(closeDriveDetail());
      ctrl.setFormPage((current) =>
        current && (current.kind === 'move' || current.kind === 'copy')
          ? current.browsePath === pickerPath
            ? current
            : {
                ...current,
                browsePath: pickerPath,
                targetPath: pickerPath,
                error: ''
              }
          : current
      );
    }, [ctrl.dispatch, ctrl.formPage, ctrl.setFormPage, navigation, pickerPath])
  );

  const formPage = ctrl.formPage && (ctrl.formPage.kind === 'move' || ctrl.formPage.kind === 'copy') ? ctrl.formPage : null;
  const mountId = formPage ? getSingleMountId(formPage.entries) : '';
  const moveCopyMount = (mountId && ctrl.mountMap[mountId]) || ctrl.currentMount;
  const resolvedPickerMountName = pickerMountName || moveCopyMount?.name || '';

  const handleSubmit = useCallback(() => {
    void ctrl.submitFormPage((destination) => {
      if (destination === 'tasks') {
        navigation.replace('DriveTasks');
        return;
      }
      closeOperationAfterSuccess(navigation, 'DriveMoveCopyPicker');
    });
  }, [ctrl.submitFormPage, navigation]);

  const closeCreateFolder = useCallback(() => {
    if (createFolderSubmitting) {
      return;
    }
    setCreateFolderVisible(false);
    setCreateFolderValue('');
    setCreateFolderError('');
  }, [createFolderSubmitting]);

  const handleCreateFolder = useCallback(() => {
    const name = createFolderValue.trim();
    if (!name) {
      setCreateFolderError('请输入目录名称');
      return;
    }
    if (!ctrl.baseUrl || !mountId) {
      setCreateFolderError('当前目录不可用');
      return;
    }

    setCreateFolderSubmitting(true);
    setCreateFolderError('');

    void createDriveFolder(ctrl.baseUrl, { mountId, path: pickerPath, name })
      .then(async (createdEntry) => {
        if (ctrl.currentMountId === mountId && ctrl.currentPath === pickerPath) {
          await ctrl.loadBrowserEntries(true);
        }

        setCreateFolderSubmitting(false);
        setCreateFolderVisible(false);
        setCreateFolderValue('');
        setCreateFolderError('');
        ctrl.dispatch(showToast({ message: `已创建 ${name}`, tone: 'success' }));

        navigation.push('DriveMoveCopyPicker', {
          path: normalizeDirectory(createdEntry.path),
          mountName: resolvedPickerMountName
        });
      })
      .catch((error) => {
        setCreateFolderSubmitting(false);
        setCreateFolderError(formatError(error));
      });
  }, [
    createFolderValue,
    ctrl.baseUrl,
    ctrl.currentMountId,
    ctrl.currentPath,
    ctrl.dispatch,
    ctrl.loadBrowserEntries,
    mountId,
    navigation,
    pickerPath,
    resolvedPickerMountName
  ]);

  return (
    <View style={[styles.page, { backgroundColor: ctrl.palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
      {formPage ? (
        <MoveCopyPickerPage
          palette={ctrl.palette}
          theme={ctrl.theme}
          formPage={formPage}
          currentMount={moveCopyMount}
          bottomInset={insets.bottom}
          createFolderVisible={createFolderVisible}
          createFolderValue={createFolderValue}
          createFolderSubmitting={createFolderSubmitting}
          createFolderError={createFolderError}
          onOpenCreateFolder={() => {
            setCreateFolderError('');
            setCreateFolderValue('');
            setCreateFolderVisible(true);
          }}
          onCloseCreateFolder={closeCreateFolder}
          onChangeCreateFolderValue={(value) => {
            setCreateFolderValue(value);
            if (createFolderError) {
              setCreateFolderError('');
            }
          }}
          onCreateFolder={handleCreateFolder}
          onOpenDirectory={(path) =>
            navigation.push('DriveMoveCopyPicker', {
              path,
              mountName: resolvedPickerMountName
            })
          }
          onSubmit={handleSubmit}
        />
      ) : null}
    </View>
  );
}

function DriveFormRouteScreen({
  navigation,
  ctrl,
  onBindNavigation,
  onRouteFocus,
  testIDPrefix
}: DriveRouteScreenProps<'DriveForm'> & CommonDriveRouteProps) {
  const insets = useSafeAreaInsets();

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('DriveForm')
  });

  useFocusEffect(
    useCallback(() => {
      if (!ctrl.formPage) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
        return;
      }
      ctrl.dispatch(openDriveDetail({ mode: 'operation', title: resolveFormTitle(ctrl.formPage) }));
    }, [ctrl.dispatch, ctrl.formPage, navigation])
  );

  const handleSubmit = useCallback(() => {
    void ctrl.submitFormPage((destination) => {
      if (destination === 'tasks') {
        navigation.replace('DriveTasks');
        return;
      }
      closeOperationAfterSuccess(navigation, 'DriveForm');
    });
  }, [ctrl.submitFormPage, navigation]);

  const formContent = ctrl.formPage ? (
    <FormPage
      palette={ctrl.palette}
      theme={ctrl.theme}
      formPage={ctrl.formPage}
      currentMount={ctrl.currentMount}
      currentPath={ctrl.currentPath}
      bottomInset={insets.bottom}
      onChangeFormValue={(value) =>
        ctrl.setFormPage((current) =>
          current &&
          (current.kind === 'create-folder' || current.kind === 'rename' || current.kind === 'batch-download')
            ? { ...current, value, error: '' }
            : current
        )
      }
      onSubmit={handleSubmit}
      onBrowseDirectory={(path) =>
        ctrl.setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? { ...current, browsePath: path, targetPath: path, error: '' }
            : current
        )
      }
      onBrowseUp={() =>
        ctrl.setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? {
                ...current,
                browsePath: dirnamePath(current.browsePath),
                targetPath: dirnamePath(current.browsePath),
                error: ''
              }
            : current
        )
      }
    />
  ) : null;

  if (ctrl.formPage && (ctrl.formPage.kind === 'move' || ctrl.formPage.kind === 'copy')) {
    return (
      <View style={[styles.page, { backgroundColor: ctrl.palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
        {formContent}
      </View>
    );
  }

  return <DriveScrollScene ctrl={ctrl} testIDPrefix={testIDPrefix}>{formContent}</DriveScrollScene>;
}

export function DriveScreen({
  onBindNavigation,
  onRouteFocus,
  testIDPrefix = 'drive'
}: DriveRouteBridgeProps & { testIDPrefix?: string }) {
  const ctrl = useDriveController();

  return (
    <View style={styles.page}>
      <Stack.Navigator
        id={`DriveScreen-${testIDPrefix}`}
        initialRouteName="DriveBrowser"
        screenOptions={{ headerShown: false, gestureEnabled: true }}
      >
        <Stack.Screen name="DriveBrowser" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveBrowserRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveSearch" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveSearchRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveMenu" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveMenuRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveTasks" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveTasksRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveTrash" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveTrashRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DrivePreview" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DrivePreviewRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveForm" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveFormRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="DriveMoveCopyPicker" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <DriveMoveCopyPickerRouteScreen
              {...props}
              ctrl={ctrl}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              testIDPrefix={testIDPrefix}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}

export function ShellDriveTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  onBindNavigation,
  onRouteFocus
}: ShellDriveTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('drive');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.page} testID="drive-route-stack">
      <DriveScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} testIDPrefix="drive" />
    </View>
  );
}
