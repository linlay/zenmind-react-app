import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openDriveTasks, openDriveTrash, setDriveSelectionMode } from '../../../../modules/drive/state/driveSlice';
import { dirnamePath } from './utils';
import { DriveContentProps } from './types';
import { useDriveController } from './useDriveController';
import { BrowserPage } from './components/BrowserPage';
import { SearchPage } from './components/SearchPage';
import { MenuPage } from './components/MenuPage';
import { TasksPage } from './components/TasksPage';
import { TrashPage } from './components/TrashPage';
import { PreviewPage } from './components/PreviewPage';
import { EntryActionsPage } from './components/EntryActionsPage';
import { CreateActionsSheet } from './components/CreateActionsSheet';
import { FormPage } from './components/FormPage';
import { SelectionBar } from './components/SelectionBar';
import { PlusIcon } from './components/Icons';
import { buildTestID } from './utils';
import styles from './DriveContent.styles';

export function DriveContent({ testIDPrefix = 'drive' }: DriveContentProps) {
  const insets = useSafeAreaInsets();
  const ctrl = useDriveController();
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [pendingCreateAction, setPendingCreateAction] = useState<'upload' | 'create-folder' | null>(null);

  const selectionBarVisible =
    ctrl.drivePanel === 'browser' &&
    !ctrl.previewPage &&
    !ctrl.entryActionsPage &&
    !ctrl.formPage &&
    ctrl.driveSelectionMode &&
    ctrl.selectedEntries.length > 0;

  const uploadFabVisible =
    ctrl.drivePanel === 'browser' &&
    !ctrl.previewPage &&
    !ctrl.entryActionsPage &&
    !ctrl.formPage &&
    !ctrl.driveSelectionMode &&
    Boolean(ctrl.baseUrl) &&
    Boolean(ctrl.currentMountId);
  const browserPageActive = ctrl.drivePanel === 'browser' && !ctrl.previewPage && !ctrl.formPage;
  const contentBottomPadding = selectionBarVisible ? Math.max(insets.bottom + 176, 196) : Math.max(insets.bottom + 32, 40);

  useEffect(() => {
    if (!uploadFabVisible) {
      setCreateSheetVisible(false);
      setPendingCreateAction(null);
    }
  }, [uploadFabVisible]);

  useEffect(() => {
    if (createSheetVisible || !pendingCreateAction) {
      return;
    }

    const timer = setTimeout(() => {
      if (pendingCreateAction === 'upload') {
        void ctrl.handlePickUploadFiles();
      } else {
        ctrl.openCreateFolderPage();
      }
      setPendingCreateAction(null);
    }, 240);

    return () => clearTimeout(timer);
  }, [createSheetVisible, ctrl, pendingCreateAction]);

  const renderBody = () => {
    if (ctrl.previewPage) {
      return (
        <PreviewPage
          palette={ctrl.palette}
          theme={ctrl.theme}
          previewPage={ctrl.previewPage}
          previewSourceUrl={ctrl.previewSourceUrl}
          markdownStyles={ctrl.markdownStyles}
          onDownload={ctrl.handleDownloadEntries}
          onRename={ctrl.openRenamePage}
          onMoveCopy={ctrl.openMoveCopyPage}
          onDelete={ctrl.openDeletePage}
        />
      );
    }
    if (ctrl.formPage) {
      return (
        <FormPage
          palette={ctrl.palette}
          theme={ctrl.theme}
          formPage={ctrl.formPage}
          currentMount={ctrl.currentMount}
          currentPath={ctrl.currentPath}
          onChangeFormValue={(value) =>
            ctrl.setFormPage((current) =>
              current &&
              (current.kind === 'create-folder' || current.kind === 'rename' || current.kind === 'batch-download')
                ? { ...current, value, error: '' }
                : current
            )
          }
          onSubmit={() => void ctrl.submitFormPage()}
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
      );
    }
    if (ctrl.drivePanel === 'search') {
      return (
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
          onEntryPress={ctrl.handleEntryPress}
          onEntryLongPress={ctrl.handleEntryLongPress}
          onEntryMore={ctrl.openEntryActionsPage}
        />
      );
    }
    if (ctrl.drivePanel === 'menu') {
      return (
        <MenuPage
          palette={ctrl.palette}
          showHidden={ctrl.showHidden}
          mounts={ctrl.mounts}
          currentMountId={ctrl.currentMountId}
          currentMount={ctrl.currentMount}
          onMountSelect={(mountId) => {
            ctrl.setCurrentMountId(mountId);
            ctrl.setCurrentPath('/');
          }}
          onRefresh={() => void ctrl.loadBrowserEntries(false)}
          onToggleHidden={() => ctrl.setShowHidden((prev) => !prev)}
          onOpenTasks={() => ctrl.dispatch(openDriveTasks())}
          onOpenTrash={() => ctrl.dispatch(openDriveTrash())}
        />
      );
    }
    if (ctrl.drivePanel === 'tasks') {
      return (
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
      );
    }
    if (ctrl.drivePanel === 'trash') {
      return (
        <TrashPage
          palette={ctrl.palette}
          theme={ctrl.theme}
          trashLoading={ctrl.trashLoading}
          trashError={ctrl.trashError}
          trashItems={ctrl.trashItems}
          onRestore={(id) => void ctrl.handleRestoreTrashItem(id)}
          onDelete={(id) => void ctrl.handleDeleteTrashItem(id)}
        />
      );
    }
    return (
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
        onEntryPress={ctrl.handleEntryPress}
        onEntryLongPress={ctrl.handleEntryLongPress}
        onEntryMore={ctrl.openEntryActionsPage}
        onOpenTasks={() => ctrl.dispatch(openDriveTasks())}
        onOpenTrash={() => ctrl.dispatch(openDriveTrash())}
      />
    );
  };

  return (
    <View style={[styles.page, { backgroundColor: ctrl.palette.pageBg }]} testID={buildTestID(testIDPrefix, 'page')}>
      {browserPageActive ? (
        renderBody()
      ) : (
        <ScrollView
          style={styles.listWrap}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            !ctrl.previewPage && !ctrl.formPage ? (
              <RefreshControl
                refreshing={ctrl.browserRefreshing && ctrl.drivePanel === 'browser'}
                onRefresh={() => void ctrl.loadBrowserEntries(true)}
                tintColor={ctrl.palette.primaryDeep}
              />
            ) : undefined
          }
        >
          {renderBody()}
        </ScrollView>
      )}

      <EntryActionsPage
        palette={ctrl.palette}
        theme={ctrl.theme}
        entryActionsPage={ctrl.entryActionsPage}
        bottomInset={insets.bottom}
        onClose={ctrl.closeEntryActionsPage}
        onPreview={ctrl.openPreviewPage}
        onDownload={ctrl.handleDownloadEntries}
        onRename={ctrl.openRenamePage}
        onMoveCopy={ctrl.openMoveCopyPage}
        onDelete={ctrl.openDeletePage}
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
          onDownload={ctrl.handleDownloadEntries}
          onRename={ctrl.openRenamePage}
          onMoveCopy={ctrl.openMoveCopyPage}
          onDelete={ctrl.openDeletePage}
        />
      ) : null}
    </View>
  );
}
