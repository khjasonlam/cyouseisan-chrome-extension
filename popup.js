/** 調整さんのURL */
const CHOUISEISAN_URL = 'chouseisan.com';
/** デフォルトの時間枠 */
const DEFAULT_DURATION = '60';
/** ステータス表示時間 */
const STATUS_DISPLAY_TIME = 3000;

/** スケジュールフォーム */
let scheduleForm;
/** ステータス表示 */
let statusDiv;

/** ポップアップ初期化 */
document.addEventListener('DOMContentLoaded', () => {
  scheduleForm = document.getElementById('scheduleForm');
  statusDiv = document.getElementById('status');
  setDefaultValues();
  setupEventListeners();
  checkCurrentSite();
});

/** フォームのデフォルト値を設定 */
const setDefaultValues = () => {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = (currentHour + 1) % 24;
  // 日付フィールド
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
  // 時間フィールド
  populateTimeDropdowns();
  document.getElementById('startTime').value = `${currentHour.toString().padStart(2, '0')}:00`;
  document.getElementById('endTime').value = `${nextHour.toString().padStart(2, '0')}:00`;
  document.getElementById('duration').value = DEFAULT_DURATION;
  document.body.classList.add('time-mode');
  document.getElementById('timeFields').classList.add('visible');
};

/** 時間ドロップダウンを30分間隔で生成 */
const populateTimeDropdowns = () => {
  const startSelect = document.getElementById('startTime');
  const endSelect = document.getElementById('endTime');
  const placeholder = '<option value="">時刻を選択</option>';
  startSelect.innerHTML = placeholder;
  endSelect.innerHTML = placeholder;
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString().padStart(2, '0');
    ['00', '30'].forEach((minutes) => {
      const timeValue = `${hourStr}:${minutes}`;
      const option = document.createElement('option');
      option.value = timeValue;
      option.textContent = timeValue;
      startSelect.appendChild(option.cloneNode(true));
      endSelect.appendChild(option);
    });
  }
};

/** イベントリスナーを設定 */
const setupEventListeners = () => {
  scheduleForm.addEventListener('submit', handleFormSubmission);
  document.getElementById('fullDay').addEventListener('change', handleFullDayToggle);
  document.getElementById('startTime').addEventListener('change', updateDurationOptions);
  document.getElementById('endTime').addEventListener('change', updateDurationOptions);
};

/** 終日イベントの切り替え処理 */
const handleFullDayToggle = () => {
  const fullDayCheckbox = document.getElementById('fullDay');
  const timeFields = document.getElementById('timeFields');
  const timeFieldIds = ['startTime', 'endTime', 'duration'];
  if (fullDayCheckbox.checked) {
    // 終日モード
    timeFields.classList.add('hidden');
    timeFields.classList.remove('visible');
    document.body.classList.add('full-day-mode');
    document.body.classList.remove('time-mode');
    timeFieldIds.forEach((id) => {
      const field = document.getElementById(id);
      field.value = '';
    });
  } else {
    // 時間指定モード
    timeFields.classList.add('visible');
    timeFields.classList.remove('hidden');
    document.body.classList.add('time-mode');
    document.body.classList.remove('full-day-mode');
    // デフォルト値をリセット
    resetTimeFields();
    updateDurationOptions();
  }
};

/** 時間フィールドをデフォルト値にリセット */
const resetTimeFields = () => {
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = (currentHour + 1) % 24;
  document.getElementById('startTime').value = `${currentHour.toString().padStart(2, '0')}:00`;
  document.getElementById('endTime').value = `${nextHour.toString().padStart(2, '0')}:00`;
  document.getElementById('duration').value = DEFAULT_DURATION;
};

/** ステータスメッセージを表示 */
const showStatus = (message, isSuccess = true) => {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isSuccess ? 'success' : 'error'}`;
  statusDiv.style.display = 'block';
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, STATUS_DISPLAY_TIME);
};

/** 現在のサイトが調整さんかチェック */
const checkCurrentSite = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const isChouseisan = tabs[0].url?.includes(CHOUISEISAN_URL);
    isChouseisan ? enableForm() : disableForm();
  });
};

/** フォームを有効化 */
const enableForm = () => {
  scheduleForm.style.display = 'block';
  document.body.classList.remove('disabled-mode');
  const fullDayCheckbox = document.getElementById('fullDay');
  if (fullDayCheckbox.checked) {
    document.body.classList.add('full-day-mode');
    document.body.classList.remove('time-mode');
  } else {
    document.body.classList.add('time-mode');
    document.body.classList.remove('full-day-mode');
    updateDurationOptions();
  }
};

/** フォームを無効化 */
const disableForm = () => {
  scheduleForm.style.display = 'none';
  document.body.classList.add('disabled-mode');
  document.body.classList.remove('full-day-mode', 'time-mode');
  const disabledMessage = document.createElement('div');
  disabledMessage.style.cssText = 'text-align: center; padding: 15px; color: #666; font-size: 14px;';
  disabledMessage.innerHTML = `
    <p>この拡張機能は<strong>調整さん</strong>でのみ動作します</p>
    <p><a href="https://chouseisan.com/" target="_blank">調整さん</a>にアクセスして拡張機能をご利用ください。</p>
  `;
  document.querySelector('.container')?.appendChild(disabledMessage);
};

/** フォーム送信処理 */
const handleFormSubmission = (e) => {
  e.preventDefault();
  const formData = {
    eventTitle: document.getElementById('eventTitle').value,
    memo: document.getElementById('memo').value,
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
    startTime: document.getElementById('startTime').value,
    endTime: document.getElementById('endTime').value,
    duration: document.getElementById('duration').value,
    fullDay: document.getElementById('fullDay').checked,
    overwrite: document.getElementById('overwrite').checked,
    excludeHolidays: document.getElementById('excludeHolidays').checked,
  };
  if (!validateFormData(formData)) return;
  sendDataToContentScript(formData);
};

/** 時間差を分単位で計算 */
const calculateTotalTimeMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = new Date(`2000-01-01T${startTime}`);
  let end = new Date(`2000-01-01T${endTime}`);
  if (start >= end) {
    end.setDate(end.getDate() + 1);
  }
  return (end.getTime() - start.getTime()) / (1000 * 60);
};

/** 利用可能な時間枠オプションを取得 */
const getAvailableDurationOptions = (totalMinutes) => {
  const allOptions = [
    { value: '30', text: '30分' },
    { value: '60', text: '1時間' },
    { value: '90', text: '1時間30分' },
    { value: '120', text: '2時間' },
  ];
  return totalMinutes === 0 ? allOptions : allOptions.filter((option) => parseInt(option.value) <= totalMinutes);
};

/** 時間枠オプションを更新 */
const updateDurationOptions = () => {
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const durationSelect = document.getElementById('duration');
  const currentDuration = durationSelect.value;
  const totalMinutes = calculateTotalTimeMinutes(startTime, endTime);
  const availableOptions = getAvailableDurationOptions(totalMinutes);
  durationSelect.innerHTML = '<option value="">時間枠を選択</option>';
  availableOptions.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.text;
    durationSelect.appendChild(optionElement);
  });
  if (currentDuration && availableOptions.some((option) => option.value === currentDuration)) {
    durationSelect.value = currentDuration;
  } else if (currentDuration) {
    smartAdjustDuration();
  } else {
    durationSelect.value = '';
  }
};

/** 時間枠を自動調整 */
const smartAdjustDuration = () => {
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  if (!startTime || !endTime) return;
  const totalMinutes = calculateTotalTimeMinutes(startTime, endTime);
  const availableOptions = getAvailableDurationOptions(totalMinutes);
  if (availableOptions.length === 0) return;
  const selectedDuration = availableOptions.some((option) => option.value === '60')
    ? availableOptions.find((option) => option.value === '60')
    : availableOptions[availableOptions.length - 1];
  document.getElementById('duration').value = selectedDuration.value;
};

/** フォームデータを検証 */
const validateFormData = (formData) => {
  const basicFields = formData.eventTitle && formData.startDate && formData.endDate;
  if (!basicFields) {
    showStatus('必須項目をすべて入力してください', false);
    return false;
  }
  if (!formData.fullDay && (!formData.startTime || !formData.endTime || !formData.duration)) {
    showStatus('必須項目をすべて入力してください', false);
    return false;
  }
  if (formData.startDate > formData.endDate) {
    showStatus('終了日は開始日より後に設定してください', false);
    return false;
  }
  return true;
};

/** コンテンツスクリプトにデータを送信 */
const sendDataToContentScript = (formData) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0].url;
    if (currentUrl?.includes(CHOUISEISAN_URL)) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scheduleSubmitted', data: formData }, (response) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          if (error.message?.includes('Could not establish connection')) {
            showStatus('エラー: コンテンツスクリプトが読み込まれていません。ページを更新して再試行してください。', false);
          } else {
            showStatus('エラー: ページとの通信に失敗しました。ページを更新してください。', false);
          }
        } else if (response?.success) {
          showStatus('スケジュールが追加されました！', true);
        } else if (response && !response.success) {
          showStatus(`エラー: ${response.message || 'スケジュール入力欄が見つかりませんでした'}`, false);
        } else {
          showStatus('エラー: コンテンツスクリプトからの応答がありません', false);
        }
      });
    }
  });
};
