import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { THEMES, FONT_MONO } from '../../../../core/constants/theme';
import { ensureFreshAccessToken } from '../../../../core/auth/appAuth';
import { toBackendBaseUrl } from '../../../../core/network/endpoint';
import { formatError } from '../../../../core/network/apiClient';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  closeDriveDetail,
  openDriveDetail,
  openDriveTasks,
  openDriveTrash,
  resetDriveUi,
  setDriveSelectionMode
} from '../../../../modules/drive/state/driveSlice';
import {
  buildAbsoluteDriveUrl,
  buildDriveRawFilePath,
  buildDriveTaskDownloadPath,
  createDriveBatchDownload,
  createDriveFolder,
  copyDriveEntry,
  deleteDriveEntry,
  deleteDriveTask,
  deleteDriveTrash,
  getDriveFileContent,
  getDrivePreview,
  getDriveTask,
  listDriveFiles,
  listDriveMounts,
  listDriveTasks,
  listDriveTrash,
  moveDriveEntry,
  renameDriveEntry,
  restoreDriveTrash,
  searchDriveFiles,
  uploadDriveFiles
} from '../../../../modules/drive/api/driveApi';
import {
  DriveEditorDocument,
  DriveEntry,
  DriveMount,
  DriveSearchHit,
  DriveTask,
  DriveTrashItem,
  DriveUploadAsset
} from '../../../../modules/drive/types';
import { showToast } from '../../../ui/uiSlice';
import { getTabPagePalette } from '../../styles/tabPageVisual';
import {
  sameEntry,
  sortEntries,
  sortSearchHits,
  basename,
  dirnamePath,
  normalizeDirectory,
  buildBreadcrumbs,
  resolvePreviewRelativePath,
  getSingleMountId,
  defaultTargetDirectory,
} from './utils';
import {
  DrivePalette,
  PreviewPageState,
  EntryActionsPageState,
  DriveFormPageState,
} from './types';

const DRIVE_DOWNLOAD_DIR = 'drive-downloads';

function sanitizeLocalFileName(name: string, fallback: string): string {
  const trimmed = String(name || '').trim();
  const base = basename(trimmed) || fallback;
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

export function useDriveController() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const drivePanel = useAppSelector((state) => state.drive.panel);
  const driveDetailMode = useAppSelector((state) => state.drive.detailMode);
  const driveSearchQuery = useAppSelector((state) => state.drive.searchQuery);
  const driveSelectionMode = useAppSelector((state) => state.drive.selectionMode);

  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const sharedPalette = useMemo(() => getTabPagePalette(theme), [theme]);
  const baseUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);

  const [mounts, setMounts] = useState<DriveMount[]>([]);
  const [mountsLoading, setMountsLoading] = useState(false);
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [browserRefreshing, setBrowserRefreshing] = useState(false);
  const [browserError, setBrowserError] = useState('');
  const [currentMountId, setCurrentMountId] = useState('');
  const [currentPath, setCurrentPath] = useState('/');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<DriveEntry[]>([]);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<DriveSearchHit[]>([]);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [tasks, setTasks] = useState<DriveTask[]>([]);

  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [trashItems, setTrashItems] = useState<DriveTrashItem[]>([]);

  const [previewPage, setPreviewPage] = useState<PreviewPageState | null>(null);
  const [entryActionsPage, setEntryActionsPage] = useState<EntryActionsPageState | null>(null);
  const [formPage, setFormPage] = useState<DriveFormPageState | null>(null);
  const uploadPickerBusyRef = useRef(false);

  const currentMount = useMemo(
    () => mounts.find((mount) => mount.id === currentMountId) || null,
    [currentMountId, mounts]
  );
  const mountMap = useMemo(() => new Map(mounts.map((mount) => [mount.id, mount.name])), [mounts]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentPath), [currentPath]);
  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const sortedSearchResults = useMemo(() => sortSearchHits(searchResults), [searchResults]);
  const selectedSingleEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;

  const palette: DrivePalette = useMemo(
    () => ({
      pageBg: sharedPalette.pageBackground,
      cardBg: sharedPalette.cardBackground,
      cardBorder: theme.border,
      iconTileBg: theme.surface,
      text: theme.text,
      textSoft: theme.textSoft,
      textMute: theme.textMute,
      primary: theme.primary,
      primaryDeep: theme.primaryDeep,
      primarySoft: theme.primarySoft,
      danger: theme.danger,
      ok: theme.ok,
      overlay: theme.overlay
    }),
    [sharedPalette, theme]
  );

  const markdownStyles = useMemo(
    () => ({
      body: {
        color: theme.text,
        fontSize: 15,
        lineHeight: 23
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 10
      },
      heading1: {
        color: theme.text,
        fontSize: 24,
        marginBottom: 12
      },
      heading2: {
        color: theme.text,
        fontSize: 20,
        marginBottom: 10
      },
      link: {
        color: theme.primaryDeep
      },
      bullet_list: {
        marginBottom: 8
      },
      ordered_list: {
        marginBottom: 8
      },
      code_inline: {
        color: theme.primaryDeep,
        backgroundColor: theme.primarySoft,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 6
      },
      code_block: {
        color: theme.text,
        backgroundColor: theme.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: FONT_MONO
      },
      fence: {
        color: theme.text,
        backgroundColor: theme.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: FONT_MONO
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: theme.primary,
        paddingLeft: 12,
        color: theme.textSoft
      }
    }),
    [theme]
  );

  // --- Effects ---

  useEffect(() => {
    dispatch(resetDriveUi());
    return () => {
      dispatch(resetDriveUi());
    };
  }, [dispatch]);

  useEffect(() => {
    if (!baseUrl) {
      setMounts([]);
      setCurrentMountId('');
      setEntries([]);
      setBrowserError('请先在设置页配置网盘后端地址');
      setMountsLoading(false);
      return;
    }

    let cancelled = false;
    setMountsLoading(true);
    setBrowserError('');

    (async () => {
      try {
        const nextMounts = await listDriveMounts(baseUrl);
        if (cancelled) {
          return;
        }
        setMounts(nextMounts);
        setCurrentMountId((previous) => {
          if (nextMounts.some((mount) => mount.id === previous)) {
            return previous;
          }
          return nextMounts[0]?.id || '';
        });
        if (!nextMounts.length) {
          setCurrentPath('/');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMounts([]);
        setCurrentMountId('');
        setEntries([]);
        setBrowserError(formatError(error));
      } finally {
        if (!cancelled) {
          setMountsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (!mounts.length) {
      return;
    }
    if (mounts.some((mount) => mount.id === currentMountId)) {
      return;
    }
    setCurrentMountId(mounts[0].id);
    setCurrentPath('/');
  }, [currentMountId, mounts]);

  const loadBrowserEntries = useCallback(
    async (silent = false) => {
      if (!baseUrl || !currentMountId) {
        setEntries([]);
        setEntriesLoading(false);
        setBrowserRefreshing(false);
        return;
      }

      if (silent) {
        setBrowserRefreshing(true);
      } else {
        setEntriesLoading(true);
      }
      setBrowserError('');

      try {
        const rows = await listDriveFiles(baseUrl, currentMountId, currentPath, showHidden);
        setEntries(rows);
      } catch (error) {
        setBrowserError(formatError(error));
      } finally {
        if (silent) {
          setBrowserRefreshing(false);
        } else {
          setEntriesLoading(false);
        }
      }
    },
    [baseUrl, currentMountId, currentPath, showHidden]
  );

  useEffect(() => {
    void loadBrowserEntries(false);
  }, [loadBrowserEntries]);

  useEffect(() => {
    setSelectedEntries([]);
  }, [currentMountId, currentPath]);

  useEffect(() => {
    if (!driveSelectionMode) {
      setSelectedEntries([]);
    }
  }, [driveSelectionMode]);

  useEffect(() => {
    if (driveDetailMode !== 'none') {
      return;
    }
    setPreviewPage(null);
    setEntryActionsPage(null);
    setFormPage(null);
  }, [driveDetailMode]);

  useEffect(() => {
    if (drivePanel !== 'search' || !baseUrl) {
      return;
    }
    const keyword = String(driveSearchQuery || '').trim();
    if (!keyword) {
      setSearchLoading(false);
      setSearchError('');
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError('');
    const timer = setTimeout(() => {
      searchDriveFiles(baseUrl, keyword, showHidden)
        .then((rows) => {
          if (cancelled) return;
          setSearchResults(rows);
        })
        .catch((error) => {
          if (cancelled) return;
          setSearchError(formatError(error));
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [baseUrl, drivePanel, driveSearchQuery, showHidden]);

  const loadTasks = useCallback(
    async (silent = false) => {
      if (!baseUrl) {
        setTasks([]);
        return;
      }
      if (!silent) {
        setTasksLoading(true);
      }
      setTasksError('');
      try {
        const rows = await listDriveTasks(baseUrl);
        setTasks(rows.sort((left, right) => right.updatedAt - left.updatedAt));
      } catch (error) {
        setTasksError(formatError(error));
      } finally {
        if (!silent) {
          setTasksLoading(false);
        }
      }
    },
    [baseUrl]
  );

  const loadTrash = useCallback(
    async (silent = false) => {
      if (!baseUrl) {
        setTrashItems([]);
        return;
      }
      if (!silent) {
        setTrashLoading(true);
      }
      setTrashError('');
      try {
        const rows = await listDriveTrash(baseUrl);
        setTrashItems(rows.sort((left, right) => right.deletedAt - left.deletedAt));
      } catch (error) {
        setTrashError(formatError(error));
      } finally {
        if (!silent) {
          setTrashLoading(false);
        }
      }
    },
    [baseUrl]
  );

  useEffect(() => {
    if (drivePanel === 'tasks') {
      void loadTasks(false);
    }
  }, [drivePanel, loadTasks]);

  useEffect(() => {
    if (drivePanel === 'trash') {
      void loadTrash(false);
    }
  }, [drivePanel, loadTrash]);

  useEffect(() => {
    if (drivePanel !== 'tasks' || !tasks.some((task) => task.status === 'pending' || task.status === 'running')) {
      return;
    }
    const timer = setInterval(() => {
      void loadTasks(true);
    }, 1800);
    return () => clearInterval(timer);
  }, [drivePanel, loadTasks, tasks]);

  const previewEntryKey = previewPage ? `${previewPage.entry.mountId}:${previewPage.entry.path}` : '';

  useEffect(() => {
    if (!previewPage || !baseUrl) {
      return;
    }

    let cancelled = false;
    const targetEntry = previewPage.entry;

    setPreviewPage((current) =>
      current && sameEntry(current.entry, targetEntry)
        ? {
          ...current,
          loading: true,
          error: '',
          preview: null,
          document: null,
          accessToken: ''
        }
        : current
    );

    (async () => {
      try {
        const [preview, token] = await Promise.all([
          getDrivePreview(baseUrl, targetEntry.mountId, targetEntry.path),
          ensureFreshAccessToken(baseUrl, { failureMode: 'soft' })
        ]);

        if (cancelled) {
          return;
        }

        let documentPayload: DriveEditorDocument | null = null;
        if (preview.kind === 'text' || preview.kind === 'markdown') {
          documentPayload = await getDriveFileContent(baseUrl, targetEntry.mountId, targetEntry.path);
          if (cancelled) {
            return;
          }
        }

        setPreviewPage((current) =>
          current && sameEntry(current.entry, targetEntry)
            ? {
              ...current,
              loading: false,
              preview,
              document: documentPayload,
              accessToken: token || ''
            }
            : current
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        setPreviewPage((current) =>
          current && sameEntry(current.entry, targetEntry)
            ? {
              ...current,
              loading: false,
              error: formatError(error)
            }
            : current
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, previewEntryKey, previewPage]);

  const browseMountId =
    formPage && (formPage.kind === 'move' || formPage.kind === 'copy') ? getSingleMountId(formPage.entries) : '';
  const browsePath = formPage && (formPage.kind === 'move' || formPage.kind === 'copy') ? formPage.browsePath : '';

  useEffect(() => {
    if (!baseUrl || !browseMountId || !browsePath) {
      return;
    }

    let cancelled = false;
    setFormPage((current) =>
      current && (current.kind === 'move' || current.kind === 'copy')
        ? {
          ...current,
          loading: true,
          error: current.submitting ? current.error : ''
        }
        : current
    );

    listDriveFiles(baseUrl, browseMountId, browsePath, showHidden)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const directories = sortEntries(rows.filter((row) => row.isDir));
        setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? {
              ...current,
              browseEntries: directories,
              loading: false
            }
            : current
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? {
              ...current,
              loading: false,
              error: formatError(error)
            }
            : current
        );
      });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, browseMountId, browsePath, formPage, showHidden]);

  // --- Callbacks ---

  const closeDetailPages = useCallback(() => {
    dispatch(closeDriveDetail());
  }, [dispatch]);

  const closeEntryActionsPage = useCallback(() => {
    setEntryActionsPage(null);
  }, []);

  const navigateToDirectory = useCallback(
    (mountId: string, path: string) => {
      setCurrentMountId(mountId);
      setCurrentPath(normalizeDirectory(path));
      dispatch(setDriveSelectionMode(false));
      setEntryActionsPage(null);
      if (driveDetailMode !== 'none') {
        dispatch(closeDriveDetail());
      }
    },
    [dispatch, driveDetailMode]
  );

  const openPreviewPage = useCallback(
    (entry: DriveEntry) => {
      setEntryActionsPage(null);
      setFormPage(null);
      setPreviewPage({
        entry,
        loading: true,
        error: '',
        preview: null,
        document: null,
        accessToken: ''
      });
      dispatch(openDriveDetail({ mode: 'preview', title: entry.name || '文件详情' }));
    },
    [dispatch]
  );

  const openEntryActionsPage = useCallback(
    (entriesArg: DriveEntry[]) => {
      setPreviewPage(null);
      setFormPage(null);
      setEntryActionsPage({ entries: entriesArg });
    },
    []
  );

  const openCreateFolderPage = useCallback(() => {
    if (!currentMountId) {
      dispatch(showToast({ message: '当前没有可用挂载点', tone: 'warn' }));
      return;
    }
    setPreviewPage(null);
    setEntryActionsPage(null);
    setFormPage({
      kind: 'create-folder',
      value: '',
      submitting: false,
      error: ''
    });
    dispatch(openDriveDetail({ mode: 'operation', title: '新建目录' }));
  }, [currentMountId, dispatch]);

  const openRenamePage = useCallback(
    (entry: DriveEntry | null) => {
      if (!entry) {
        dispatch(showToast({ message: '请选择一个项目后再重命名', tone: 'warn' }));
        return;
      }
      setPreviewPage(null);
      setEntryActionsPage(null);
      setFormPage({
        kind: 'rename',
        entry,
        value: basename(entry.path),
        submitting: false,
        error: ''
      });
      dispatch(openDriveDetail({ mode: 'operation', title: '重命名' }));
    },
    [dispatch]
  );

  const openMoveCopyPage = useCallback(
    (kind: 'move' | 'copy', entriesArg: DriveEntry[]) => {
      if (!entriesArg.length) {
        dispatch(showToast({ message: '请先选择文件或目录', tone: 'warn' }));
        return;
      }
      if (!getSingleMountId(entriesArg)) {
        dispatch(showToast({ message: '当前暂不支持跨挂载点批量操作', tone: 'warn' }));
        return;
      }
      const targetPath = normalizeDirectory(defaultTargetDirectory(entriesArg, currentMountId, currentPath));
      setPreviewPage(null);
      setEntryActionsPage(null);
      setFormPage({
        kind,
        entries: entriesArg,
        browsePath: targetPath,
        targetPath,
        browseEntries: [],
        loading: true,
        submitting: false,
        error: ''
      });
      dispatch(openDriveDetail({ mode: 'operation', title: kind === 'move' ? '移动到...' : '复制到...' }));
    },
    [currentMountId, currentPath, dispatch]
  );

  const openDeletePage = useCallback(
    (entriesArg: DriveEntry[]) => {
      if (!entriesArg.length) {
        dispatch(showToast({ message: '请先选择要删除的项目', tone: 'warn' }));
        return;
      }
      if (!getSingleMountId(entriesArg)) {
        dispatch(showToast({ message: '当前暂不支持跨挂载点删除', tone: 'warn' }));
        return;
      }
      setPreviewPage(null);
      setEntryActionsPage(null);
      setFormPage({
        kind: 'delete',
        entries: entriesArg,
        submitting: false,
        error: ''
      });
      dispatch(openDriveDetail({ mode: 'operation', title: '删除确认' }));
    },
    [dispatch]
  );

  const openBatchDownloadPage = useCallback(
    (entriesArg: DriveEntry[]) => {
      if (!entriesArg.length) {
        dispatch(showToast({ message: '请先选择要下载的项目', tone: 'warn' }));
        return;
      }
      if (!getSingleMountId(entriesArg)) {
        dispatch(showToast({ message: '当前暂不支持跨挂载点打包下载', tone: 'warn' }));
        return;
      }
      setPreviewPage(null);
      setEntryActionsPage(null);
      setFormPage({
        kind: 'batch-download',
        entries: entriesArg,
        value: 'bundle.zip',
        submitting: false,
        error: ''
      });
      dispatch(openDriveDetail({ mode: 'operation', title: '打包下载' }));
    },
    [dispatch]
  );

  const toggleEntrySelection = useCallback(
    (entry: DriveEntry) => {
      const exists = selectedEntries.some((item) => sameEntry(item, entry));
      const next = exists ? selectedEntries.filter((item) => !sameEntry(item, entry)) : [...selectedEntries, entry];
      setSelectedEntries(next);
      if (!next.length) {
        dispatch(setDriveSelectionMode(false));
      }
    },
    [dispatch, selectedEntries]
  );

  const handleEntryPress = useCallback(
    (entry: DriveEntry) => {
      if (driveSelectionMode) {
        toggleEntrySelection(entry);
        return;
      }
      if (entry.isDir) {
        navigateToDirectory(entry.mountId, entry.path);
        return;
      }
      openPreviewPage(entry);
    },
    [driveSelectionMode, navigateToDirectory, openPreviewPage, toggleEntrySelection]
  );

  const handleEntryLongPress = useCallback(
    (entry: DriveEntry) => {
      if (!driveSelectionMode) {
        dispatch(setDriveSelectionMode(true));
        setSelectedEntries([entry]);
        return;
      }
      toggleEntrySelection(entry);
    },
    [dispatch, driveSelectionMode, toggleEntrySelection]
  );

  const downloadFileToDevice = useCallback(
    async (relativePath: string, fileName: string, mimeType?: string) => {
      if (!baseUrl) {
        throw new Error('当前未配置网盘后端');
      }

      const token = await ensureFreshAccessToken(baseUrl, { failureMode: 'soft' });
      const downloadDir = new Directory(Paths.cache, DRIVE_DOWNLOAD_DIR);
      if (!downloadDir.exists) {
        downloadDir.create({ idempotent: true, intermediates: true });
      }

      const safeName = sanitizeLocalFileName(fileName, 'download.bin');
      const destination = new ExpoFile(downloadDir, safeName);
      if (destination.exists) {
        destination.delete();
      }

      const downloaded = await ExpoFile.downloadFileAsync(buildAbsoluteDriveUrl(baseUrl, relativePath), destination, {
        idempotent: true,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          dialogTitle: `下载 ${safeName}`,
          mimeType: mimeType || downloaded.type || undefined
        });
      }

      return downloaded;
    },
    [baseUrl]
  );

  const handleDownloadEntries = useCallback(
    async (entriesArg: DriveEntry[]) => {
      if (!entriesArg.length) {
        return;
      }

      const first = entriesArg[0];
      if (entriesArg.length === 1 && !first.isDir) {
        try {
          await downloadFileToDevice(buildDriveRawFilePath(first.mountId, first.path), first.name || '文件', first.mime);
          dispatch(showToast({ message: `已准备 ${first.name}，可在系统面板中保存或分享`, tone: 'success' }));
        } catch (error) {
          dispatch(showToast({ message: formatError(error), tone: 'danger' }));
        }
        return;
      }

      openBatchDownloadPage(entriesArg);
    },
    [dispatch, downloadFileToDevice, openBatchDownloadPage]
  );

  const handlePickUploadFiles = useCallback(async () => {
    if (!baseUrl || !currentMountId) {
      dispatch(showToast({ message: '当前目录不可用，无法上传', tone: 'warn' }));
      return;
    }
    if (uploadPickerBusyRef.current) {
      return;
    }

    uploadPickerBusyRef.current = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 180));

      const picked = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: '*/*'
      });

      if (picked.canceled || !picked.assets?.length) {
        return;
      }

      const files: DriveUploadAsset[] = picked.assets.map((asset) =>
        asset.file || {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size
        }
      );

      const task = await uploadDriveFiles(baseUrl, currentMountId, currentPath, files);
      dispatch(showToast({ message: task.detail || '上传任务已创建', tone: 'success' }));
      await Promise.all([loadBrowserEntries(true), loadTasks(true)]);
    } catch (error) {
      dispatch(showToast({ message: formatError(error), tone: 'danger' }));
    } finally {
      uploadPickerBusyRef.current = false;
    }
  }, [baseUrl, currentMountId, currentPath, dispatch, loadBrowserEntries, loadTasks]);

  const submitFormPage = useCallback(async () => {
    if (!formPage || !baseUrl) {
      return;
    }

    if (formPage.kind === 'create-folder') {
      const name = formPage.value.trim();
      if (!name || !currentMountId) {
        setFormPage((current) =>
          current && current.kind === 'create-folder'
            ? { ...current, error: !name ? '请输入目录名称' : '当前目录不可用' }
            : current
        );
        return;
      }
      setFormPage((current) =>
        current && current.kind === 'create-folder' ? { ...current, submitting: true, error: '' } : current
      );
      try {
        await createDriveFolder(baseUrl, { mountId: currentMountId, path: currentPath, name });
        closeDetailPages();
        await loadBrowserEntries(true);
        dispatch(showToast({ message: `已创建 ${name}`, tone: 'success' }));
      } catch (error) {
        setFormPage((current) =>
          current && current.kind === 'create-folder'
            ? { ...current, submitting: false, error: formatError(error) }
            : current
        );
      }
      return;
    }

    if (formPage.kind === 'rename') {
      const nextName = formPage.value.trim();
      if (!nextName) {
        setFormPage((current) =>
          current && current.kind === 'rename' ? { ...current, error: '请输入新的名称' } : current
        );
        return;
      }
      setFormPage((current) =>
        current && current.kind === 'rename' ? { ...current, submitting: true, error: '' } : current
      );
      try {
        await renameDriveEntry(baseUrl, {
          mountId: formPage.entry.mountId,
          path: formPage.entry.path,
          newName: nextName
        });
        closeDetailPages();
        dispatch(setDriveSelectionMode(false));
        await loadBrowserEntries(true);
        dispatch(showToast({ message: '重命名成功', tone: 'success' }));
      } catch (error) {
        setFormPage((current) =>
          current && current.kind === 'rename' ? { ...current, submitting: false, error: formatError(error) } : current
        );
      }
      return;
    }

    if (formPage.kind === 'move' || formPage.kind === 'copy') {
      const mountId = getSingleMountId(formPage.entries);
      if (!mountId) {
        setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? { ...current, error: '当前暂不支持跨挂载点操作' }
            : current
        );
        return;
      }
      setFormPage((current) =>
        current && (current.kind === 'move' || current.kind === 'copy')
          ? { ...current, submitting: true, error: '' }
          : current
      );
      try {
        await Promise.all(
          formPage.entries.map((entry) =>
            formPage.kind === 'move'
              ? moveDriveEntry(baseUrl, { mountId, path: entry.path, targetDir: formPage.targetPath })
              : copyDriveEntry(baseUrl, { mountId, path: entry.path, targetDir: formPage.targetPath })
          )
        );
        closeDetailPages();
        dispatch(setDriveSelectionMode(false));
        await loadBrowserEntries(true);
        dispatch(
          showToast({
            message: formPage.kind === 'move' ? '移动完成' : '复制完成',
            tone: 'success'
          })
        );
      } catch (error) {
        setFormPage((current) =>
          current && (current.kind === 'move' || current.kind === 'copy')
            ? { ...current, submitting: false, error: formatError(error) }
            : current
        );
      }
      return;
    }

    if (formPage.kind === 'delete') {
      const mountId = getSingleMountId(formPage.entries);
      if (!mountId) {
        setFormPage((current) =>
          current && current.kind === 'delete' ? { ...current, error: '当前暂不支持跨挂载点删除' } : current
        );
        return;
      }
      setFormPage((current) =>
        current && current.kind === 'delete' ? { ...current, submitting: true, error: '' } : current
      );
      try {
        await Promise.all(formPage.entries.map((entry) => deleteDriveEntry(baseUrl, { mountId, path: entry.path })));
        closeDetailPages();
        dispatch(setDriveSelectionMode(false));
        await Promise.all([loadBrowserEntries(true), loadTrash(true)]);
        dispatch(showToast({ message: '已移入垃圾桶', tone: 'success' }));
      } catch (error) {
        setFormPage((current) =>
          current && current.kind === 'delete' ? { ...current, submitting: false, error: formatError(error) } : current
        );
      }
      return;
    }

    if (formPage.kind === 'batch-download') {
      const mountId = getSingleMountId(formPage.entries);
      if (!mountId) {
        setFormPage((current) =>
          current && current.kind === 'batch-download' ? { ...current, error: '当前暂不支持跨挂载点打包下载' } : current
        );
        return;
      }
      setFormPage((current) =>
        current && current.kind === 'batch-download' ? { ...current, submitting: true, error: '' } : current
      );
      try {
        await createDriveBatchDownload(baseUrl, {
          mountId,
          items: formPage.entries.map((entry) => entry.path),
          archiveName: formPage.value.trim() || 'bundle.zip'
        });
        closeDetailPages();
        dispatch(openDriveTasks());
        await loadTasks(false);
        dispatch(showToast({ message: '已创建下载任务', tone: 'success' }));
      } catch (error) {
        setFormPage((current) =>
          current && current.kind === 'batch-download'
            ? { ...current, submitting: false, error: formatError(error) }
            : current
        );
      }
    }
  }, [
    baseUrl,
    closeDetailPages,
    currentMountId,
    currentPath,
    dispatch,
    formPage,
    loadBrowserEntries,
    loadTasks,
    loadTrash
  ]);

  const handleTaskDownload = useCallback(
    async (task: DriveTask) => {
      try {
        await downloadFileToDevice(task.downloadUrl || buildDriveTaskDownloadPath(task.id), `${task.id}.zip`, 'application/zip');
        dispatch(showToast({ message: '任务产物已准备，可在系统面板中保存或分享', tone: 'success' }));
      } catch (error) {
        dispatch(showToast({ message: formatError(error), tone: 'danger' }));
      }
    },
    [dispatch, downloadFileToDevice]
  );

  const handleRefreshSingleTask = useCallback(
    async (taskId: string) => {
      if (!baseUrl) {
        return;
      }
      try {
        const next = await getDriveTask(baseUrl, taskId);
        setTasks((previous) => {
          const merged = previous.filter((task) => task.id !== taskId);
          merged.unshift(next);
          return merged.sort((left, right) => right.updatedAt - left.updatedAt);
        });
      } catch (error) {
        dispatch(showToast({ message: formatError(error), tone: 'danger' }));
      }
    },
    [baseUrl, dispatch]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!baseUrl) {
        return;
      }
      try {
        await deleteDriveTask(baseUrl, taskId);
        await loadTasks(false);
        dispatch(showToast({ message: '任务已删除', tone: 'success' }));
      } catch (error) {
        dispatch(showToast({ message: formatError(error), tone: 'danger' }));
      }
    },
    [baseUrl, dispatch, loadTasks]
  );

  const handleRestoreTrashItem = useCallback(
    async (itemId: string) => {
      if (!baseUrl) {
        return;
      }
      try {
        const result = await restoreDriveTrash(baseUrl, { ids: [itemId] });
        await Promise.all([loadTrash(false), loadBrowserEntries(true)]);
        dispatch(
          showToast({
            message: result.conflicts.length ? `恢复失败：${result.conflicts.join('、')}` : '已恢复到原位置',
            tone: result.conflicts.length ? 'warn' : 'success'
          })
        );
      } catch (error) {
        dispatch(showToast({ message: formatError(error), tone: 'danger' }));
      }
    },
    [baseUrl, dispatch, loadBrowserEntries, loadTrash]
  );

  const handleDeleteTrashItem = useCallback(
    async (itemId: string) => {
      if (!baseUrl) {
        return;
      }
      try {
        const result = await deleteDriveTrash(baseUrl, { ids: [itemId] });
        await loadTrash(false);
        dispatch(
          showToast({
            message: result.missing.length ? `删除失败：${result.missing.join('、')}` : '已彻底删除',
            tone: result.missing.length ? 'warn' : 'success'
          })
        );
      } catch (error) {
        dispatch(showToast({ message: formatError(error), tone: 'danger' }));
      }
    },
    [baseUrl, dispatch, loadTrash]
  );

  const previewSourceUrl =
    previewPage?.preview && baseUrl
      ? buildAbsoluteDriveUrl(baseUrl, resolvePreviewRelativePath(previewPage.preview))
      : '';

  return {
    // Redux state
    dispatch,
    drivePanel,
    driveDetailMode,
    driveSearchQuery,
    driveSelectionMode,

    // Theme
    theme,
    palette,
    markdownStyles,

    // Browser state
    baseUrl,
    mounts,
    mountsLoading,
    entries,
    entriesLoading,
    browserRefreshing,
    browserError,
    currentMountId,
    currentPath,
    currentMount,
    mountMap,
    breadcrumbs,
    sortedEntries,
    showHidden,
    setShowHidden,
    setCurrentMountId,
    setCurrentPath,
    selectedEntries,
    selectedSingleEntry,

    // Search state
    searchLoading,
    searchError,
    sortedSearchResults,

    // Tasks state
    tasksLoading,
    tasksError,
    tasks,

    // Trash state
    trashLoading,
    trashError,
    trashItems,

    // Detail page states
    previewPage,
    entryActionsPage,
    formPage,
    setFormPage,
    previewSourceUrl,

    // Actions
    loadBrowserEntries,
    navigateToDirectory,
    openPreviewPage,
    openEntryActionsPage,
    openCreateFolderPage,
    openRenamePage,
    openMoveCopyPage,
    openDeletePage,
    openBatchDownloadPage,
    closeEntryActionsPage,
    handleEntryPress,
    handleEntryLongPress,
    handleDownloadEntries,
    handlePickUploadFiles,
    submitFormPage,
    handleTaskDownload,
    handleRefreshSingleTask,
    handleDeleteTask,
    handleRestoreTrashItem,
    handleDeleteTrashItem,
  };
}

export type DriveController = ReturnType<typeof useDriveController>;
