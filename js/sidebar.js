/** 調整さんのURL */
const CHOUISEISAN_URL = 'chouseisan.com';
/** デフォルトの時間枠 */
const DEFAULT_DURATION = '60';
/** ステータス表示時間 */
const STATUS_DISPLAY_TIME = 3000;
/** フォームのID */
const FIELD_IDS = ['eventTitle', 'memo', 'startDate', 'endDate', 'startTime', 'endTime', 'duration', 'fullDay', 'overwrite', 'excludeHolidays'];
/** 時間枠オプション */
const DURATION_OPTIONS = [
  { value: '30', text: '30分' },
  { value: '60', text: '1時間' },
  { value: '90', text: '1時間30分' },
  { value: '120', text: '2時間' },
];

/** スケジュールフォーム */
let scheduleForm;
/** ステータス表示 */
let statusDiv;
/** 要素を取得 */
const $ = (id) => document.getElementById(id);
const formatTime = (hour) => `${hour.toString().padStart(2, '0')}:00`;

/** サイドバー初期化 */
document.addEventListener('DOMContentLoaded', async () => {
  scheduleForm = $('scheduleForm');
  statusDiv = $('status');
  await loadSavedValues();
  setupEventListeners();
  checkCurrentSite();
  setupTabChangeListeners();
});

/** 保存された値を読み込んで復元 */
const loadSavedValues = async () => {
  const { formData: savedData } = await chrome.storage.local.get('formData');
  populateTimeDropdowns();
  if (savedData) {
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.type === 'checkbox' ? (savedData[id] !== undefined && (el.checked = savedData[id])) : savedData[id] && (el.value = savedData[id]);
    });
    setTimeMode(savedData.fullDay);
    !savedData.fullDay && updateDurationOptions();
  } else {
    setDefaultValues();
  }
};

/** フォームのデフォルト値を設定 */
const setDefaultValues = () => {
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  $('startDate').value = $('endDate').value = today;
  $('startTime').value = formatTime(hour);
  $('endTime').value = formatTime((hour + 1) % 24);
  $('duration').value = DEFAULT_DURATION;
  setTimeMode(false);
};

/** 時間ドロップダウンを30分間隔で生成 */
const populateTimeDropdowns = () => {
  const placeholder = '<option value="">時刻を選択</option>';
  const [startSelect, endSelect] = [$('startTime'), $('endTime')];
  startSelect.innerHTML = endSelect.innerHTML = placeholder;
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString().padStart(2, '0');
    ['00', '30'].forEach((min) => {
      const time = `${hourStr}:${min}`;
      const option = new Option(time, time);
      startSelect.appendChild(option.cloneNode(true));
      endSelect.appendChild(option);
    });
  }
};

/** イベントリスナーを設定 */
const setupEventListeners = () => {
  scheduleForm.addEventListener('submit', handleFormSubmission);
  $('fullDay').addEventListener('change', handleFullDayToggle);
  ['startTime', 'endTime'].forEach((id) => $(id).addEventListener('change', updateDurationOptions));
  FIELD_IDS.forEach((id) => {
    const field = $(id);
    field && field.addEventListener(field.type === 'checkbox' ? 'change' : 'input', saveFormValues);
  });
};

/** 終日イベントの切り替え処理 */
const handleFullDayToggle = () => {
  const isFullDay = $('fullDay').checked;
  setTimeMode(isFullDay);
  isFullDay ? ['startTime', 'endTime', 'duration'].forEach((id) => $(id).value = '') : (resetTimeFields(), updateDurationOptions());
  saveFormValues();
};

/** 時間モードを設定 */
const setTimeMode = (isFullDay) => {
  const timeFields = $('timeFields');
  timeFields.classList.toggle('hidden', isFullDay);
  timeFields.classList.toggle('visible', !isFullDay);
  document.body.classList.toggle('full-day-mode', isFullDay);
  document.body.classList.toggle('time-mode', !isFullDay);
};

/** 時間フィールドをデフォルト値にリセット */
const resetTimeFields = () => {
  const hour = new Date().getHours();
  $('startTime').value = formatTime(hour);
  $('endTime').value = formatTime((hour + 1) % 24);
  $('duration').value = DEFAULT_DURATION;
};

/** ステータスメッセージを表示 */
const showStatus = (message, isSuccess = true) => {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isSuccess ? 'success' : 'error'}`;
  statusDiv.style.display = 'block';
  setTimeout(() => (statusDiv.style.display = 'none'), STATUS_DISPLAY_TIME);
};

/** 既存のメッセージを削除 */
const removeExistingMessage = () => {
  const container = document.querySelector('.container');
  if (!container) return;
  const existingMsg = container.querySelector('.disabled-message');
  if (existingMsg) {
    existingMsg.remove();
  }
};

/** 現在のサイトが調整さんかチェック */
const checkCurrentSite = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      return;
    }
    const isChouseisan = tabs[0].url.includes(CHOUISEISAN_URL);
    removeExistingMessage();
    if (isChouseisan) {
      scheduleForm.style.display = 'block';
      document.body.classList.remove('disabled-mode');
      setTimeMode($('fullDay').checked);
      !$('fullDay').checked && updateDurationOptions();
    } else {
      scheduleForm.style.display = 'none';
      document.body.classList.add('disabled-mode');
      document.body.classList.remove('full-day-mode', 'time-mode');
      const msg = document.createElement('div');
      msg.className = 'disabled-message';
      msg.innerHTML = '<p>この拡張機能は<strong>調整さん</strong>でのみ動作します</p><p><a href="https://chouseisan.com/" target="_blank">調整さん</a>にアクセスして拡張機能をご利用ください。</p>';
      document.querySelector('.container')?.appendChild(msg);
    }
  });
};

/** タブ切り替えを監視 */
const setupTabChangeListeners = () => {
  chrome.tabs.onActivated.addListener(() => {
    checkCurrentSite();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id === tabId) {
          checkCurrentSite();
        }
      });
    }
  });
};

/** フォーム送信処理 */
const handleFormSubmission = (e) => {
  e.preventDefault();
  const formData = getFormData();
  if (!validateFormData(formData)) return;
  sendDataToContentScript(formData);
};

/** フォームデータを取得 */
const getFormData = () => {
  const data = {};
  FIELD_IDS.forEach((id) => {
    const el = $(id);
    data[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return data;
};

/** 時間差を分単位で計算 */
const calculateTotalTimeMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = new Date(`2000-01-01T${startTime}`);
  let end = new Date(`2000-01-01T${endTime}`);
  if (start >= end) end.setDate(end.getDate() + 1);
  return (end.getTime() - start.getTime()) / 60000;
};

/** 利用可能な時間枠オプションを取得 */
const getAvailableDurationOptions = (totalMinutes) => {
  return totalMinutes === 0 ? DURATION_OPTIONS : DURATION_OPTIONS.filter((opt) => parseInt(opt.value) <= totalMinutes);
};

/** 時間枠オプションを更新 */
const updateDurationOptions = () => {
  const [startTime, endTime] = [$('startTime').value, $('endTime').value];
  const durationSelect = $('duration');
  const currentDuration = durationSelect.value;
  const totalMinutes = calculateTotalTimeMinutes(startTime, endTime);
  const availableOptions = getAvailableDurationOptions(totalMinutes);
  durationSelect.innerHTML = '<option value="">時間枠を選択</option>';
  availableOptions.forEach((opt) => durationSelect.appendChild(new Option(opt.text, opt.value)));
  if (currentDuration && availableOptions.some((opt) => opt.value === currentDuration)) {
    durationSelect.value = currentDuration;
  } else if (currentDuration) {
    const selected = availableOptions.find((opt) => opt.value === '60') || availableOptions[availableOptions.length - 1];
    durationSelect.value = selected?.value || '';
  } else {
    durationSelect.value = '';
  }
};

/** フォームデータを検証 */
const validateFormData = (data) => {
  if (!data.eventTitle || !data.startDate || !data.endDate) {
    return showStatus('必須項目をすべて入力してください', false), false;
  }
  if (!data.fullDay && (!data.startTime || !data.endTime || !data.duration)) {
    return showStatus('必須項目をすべて入力してください', false), false;
  }
  if (data.startDate > data.endDate) {
    return showStatus('終了日は開始日より後に設定してください', false), false;
  }
  return true;
};

/** フォームの値を保存 */
const saveFormValues = () => {
  chrome.storage.local.set({ formData: getFormData() });
};

/** コンテンツスクリプトにデータを送信 */
const sendDataToContentScript = (formData) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0].url?.includes(CHOUISEISAN_URL)) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'scheduleSubmitted', data: formData }, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message?.includes('Could not establish connection')
          ? 'エラー: コンテンツスクリプトが読み込まれていません。ページを更新して再試行してください。'
          : 'エラー: ページとの通信に失敗しました。ページを更新してください。';
        showStatus(msg, false);
      } else if (response?.success) {
        showStatus('スケジュールが追加されました！', true);
      } else {
        showStatus(`エラー: ${response?.message || 'スケジュール入力欄が見つかりませんでした'}`, false);
      }
    });
  });
};
