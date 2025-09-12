/**
 * 調整さん用Chrome拡張機能
 * スケジュール作成インターフェースのポップアップスクリプト
 * @file popup.js
 */

// ============================================================================
// 定数
// ============================================================================

/** @const {string} 調整さんのURLパターンを識別するための文字列 */
const CHOUISEISAN_URL = 'chouseisan.com';

/** @const {string} デフォルトの時間枠（分） */
const DEFAULT_DURATION = '60';

/** @const {number} ステータスメッセージの表示時間（ミリ秒） */
const STATUS_DISPLAY_TIME = 3000;

// ============================================================================
// DOM要素
// ============================================================================

/** @type {HTMLFormElement} メインのスケジュールフォーム要素 */
let scheduleForm;

/** @type {HTMLDivElement} ステータスメッセージ表示要素 */
let statusDiv;

// ============================================================================
// 初期化
// ============================================================================

/**
 * DOM読み込み時にポップアップを初期化
 * 要素の設定、デフォルト値、イベントリスナー、現在のサイト確認を行う
 */
document.addEventListener('DOMContentLoaded', function() {
  initializeElements();
  setDefaultValues();
  setupEventListeners();
  checkCurrentSite();
});

// ============================================================================
// 要素初期化
// ============================================================================

/**
 * DOM要素の参照を初期化
 * 頻繁に使用される要素をキャッシュしてパフォーマンスを向上
 */
function initializeElements() {
  scheduleForm = document.getElementById('scheduleForm');
  statusDiv = document.getElementById('status');
}

// ============================================================================
// デフォルト値設定
// ============================================================================

/**
 * すべてのフォームのデフォルト値を設定
 * 日付、時間枠、時間ドロップダウン、デフォルト時刻を初期化
 */
function setDefaultValues() {
  setDefaultDates();
  setDefaultDuration();
  populateTimeDropdowns();
  setDefaultTimes();
  setInitialTimeFieldRequirements();
  setInitialPopupMode();
}

/**
 * 開始日と終了日のデフォルト値を今日に設定
 */
function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
}

/**
 * デフォルトの時間枠を1時間（60分）に設定
 */
function setDefaultDuration() {
  document.getElementById('duration').value = DEFAULT_DURATION;
}

/**
 * 現在時刻に基づいてデフォルトの開始時刻と終了時刻を設定
 * 開始時刻：現在の時間、終了時刻：次の時間（両方とも:00分）
 */
function setDefaultTimes() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = (currentHour + 1) % 24;
  
  document.getElementById('startTime').value = `${currentHour.toString().padStart(2, '0')}:00`;
  document.getElementById('endTime').value = `${nextHour.toString().padStart(2, '0')}:00`;
}

/**
 * 時間フィールドの初期必須属性を設定
 * デフォルトでは時間フィールドは必須（終日イベントがチェックされていない状態）
 */
function setInitialTimeFieldRequirements() {
  const startTimeSelect = document.getElementById('startTime');
  const endTimeSelect = document.getElementById('endTime');
  const durationSelect = document.getElementById('duration');
  
  // デフォルトでは時間フィールドは必須
  startTimeSelect.setAttribute('required', 'required');
  endTimeSelect.setAttribute('required', 'required');
  durationSelect.setAttribute('required', 'required');
}

/**
 * ポップアップの初期モードを設定
 * デフォルトでは時間モード（終日イベントがチェックされていない状態）
 */
function setInitialPopupMode() {
  const body = document.body;
  const fullDayCheckbox = document.getElementById('fullDay');
  
  // デフォルトでは時間モード
  body.classList.add('time-mode');
  body.classList.remove('full-day-mode');
  
  // 時間フィールドを表示状態に設定
  const timeFields = document.getElementById('timeFields');
  timeFields.classList.add('visible');
  timeFields.classList.remove('hidden');
}

// ============================================================================
// 時間ドロップダウン生成
// ============================================================================

/**
 * 24時間分の00分と30分オプションで時間ドロップダウンを生成
 * 00:00から23:30まで30分間隔でオプションを作成
 */
function populateTimeDropdowns() {
  const startTimeSelect = document.getElementById('startTime');
  const endTimeSelect = document.getElementById('endTime');
  
  clearTimeDropdowns(startTimeSelect, endTimeSelect);
  addTimeOptions(startTimeSelect, endTimeSelect);
}

/**
 * 時間ドロップダウンの既存オプションをクリアしてプレースホルダーを追加
 * @param {HTMLSelectElement} startSelect - 開始時刻ドロップダウン要素
 * @param {HTMLSelectElement} endSelect - 終了時刻ドロップダウン要素
 */
function clearTimeDropdowns(startSelect, endSelect) {
  const placeholder = '<option value="">時刻を選択してください</option>';
  startSelect.innerHTML = placeholder;
  endSelect.innerHTML = placeholder;
}

/**
 * 両方のドロップダウンに時間オプションを追加
 * 各時間の00分と30分バリアントのオプションを作成
 * @param {HTMLSelectElement} startSelect - 開始時刻ドロップダウン要素
 * @param {HTMLSelectElement} endSelect - 終了時刻ドロップダウン要素
 */
function addTimeOptions(startSelect, endSelect) {
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString().padStart(2, '0');
    
    // 00分オプションを追加
    const option00 = createTimeOption(`${hourStr}:00`);
    startSelect.appendChild(option00.cloneNode(true));
    endSelect.appendChild(option00);
    
    // 30分オプションを追加
    const option30 = createTimeOption(`${hourStr}:30`);
    startSelect.appendChild(option30.cloneNode(true));
    endSelect.appendChild(option30);
  }
}

/**
 * 時間オプション要素を作成
 * @param {string} timeValue - HH:MM形式の時間値
 * @returns {HTMLOptionElement} 作成されたオプション要素
 */
function createTimeOption(timeValue) {
  const option = document.createElement('option');
  option.value = timeValue;
  option.textContent = timeValue;
  return option;
}

// ============================================================================
// イベントリスナー
// ============================================================================

/**
 * ポップアップのすべてのイベントリスナーを設定
 * 現在はフォーム送信を処理
 */
function setupEventListeners() {
  scheduleForm.addEventListener('submit', handleFormSubmission);
  
  // 終日イベントチェックボックスのイベントリスナー
  const fullDayCheckbox = document.getElementById('fullDay');
  fullDayCheckbox.addEventListener('change', handleFullDayToggle);
}

/**
 * 終日イベントチェックボックスの切り替えを処理
 * チェックされた場合は時間フィールドを非表示にし、チェックが外された場合は表示する
 */
function handleFullDayToggle() {
  const fullDayCheckbox = document.getElementById('fullDay');
  const timeFields = document.getElementById('timeFields');
  const startTimeSelect = document.getElementById('startTime');
  const endTimeSelect = document.getElementById('endTime');
  const durationSelect = document.getElementById('duration');
  const body = document.body;
  
  if (fullDayCheckbox.checked) {
    // 終日イベントの場合：時間フィールドを非表示
    timeFields.classList.add('hidden');
    timeFields.classList.remove('visible');
    
    // ポップアップの高さを調整
    body.classList.add('full-day-mode');
    body.classList.remove('time-mode');
    
    // 時間フィールドの必須属性を削除
    startTimeSelect.removeAttribute('required');
    endTimeSelect.removeAttribute('required');
    durationSelect.removeAttribute('required');
    
    // 時間フィールドの値をクリア
    startTimeSelect.value = '';
    endTimeSelect.value = '';
    durationSelect.value = '';
  } else {
    // 通常イベントの場合：時間フィールドを表示
    timeFields.classList.add('visible');
    timeFields.classList.remove('hidden');
    
    // ポップアップの高さを調整
    body.classList.add('time-mode');
    body.classList.remove('full-day-mode');
    
    // 時間フィールドの必須属性を追加
    startTimeSelect.setAttribute('required', 'required');
    endTimeSelect.setAttribute('required', 'required');
    durationSelect.setAttribute('required', 'required');
    
    // デフォルト値を設定
    setDefaultTimes();
    setDefaultDuration();
  }
}

// ============================================================================
// ステータスメッセージ
// ============================================================================

/**
 * ユーザーにステータスメッセージを表示
 * 成功またはエラーメッセージを表示し、指定時間後に自動非表示
 * @param {string} message - 表示するメッセージ
 * @param {boolean} isSuccess - 成功メッセージかどうか（デフォルト: true）
 */
function showStatus(message, isSuccess = true) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isSuccess ? 'success' : 'error'}`;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, STATUS_DISPLAY_TIME);
}

// ============================================================================
// サイト検出
// ============================================================================

/**
 * 現在のタブが調整さんかどうかを確認し、フォームの状態を更新
 * アクティブタブをクエリし、URLに基づいてフォームを有効/無効にする
 */
function checkCurrentSite() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    isChouseisanSite(tabs[0].url) ? enableForm() : disableForm();
  });
}

/**
 * URLに調整さんのドメインが含まれているかチェック
 * @param {string} url - チェックするURL
 * @returns {boolean} URLが調整さん上の場合true
 */
function isChouseisanSite(url) {
  return url && url.includes(CHOUISEISAN_URL);
}

// ============================================================================
// フォーム状態管理
// ============================================================================

/**
 * フォームインターフェースを有効化
 * 調整さん上でフォームとタイトルを表示
 */
function enableForm() {
  scheduleForm.style.display = 'block';
  
  const body = document.body;
  body.classList.remove('disabled-mode');
  
  const fullDayCheckbox = document.getElementById('fullDay');
  if (fullDayCheckbox.checked) {
    body.classList.add('full-day-mode');
    body.classList.remove('time-mode');
  } else {
    body.classList.add('time-mode');
    body.classList.remove('full-day-mode');
  }
}

/**
 * フォームインターフェースを無効化
 * 調整さん以外ではフォームとタイトルを非表示にし、無効メッセージを表示
 */
function disableForm() {
  scheduleForm.style.display = 'none';
  
  const body = document.body;
  body.classList.add('disabled-mode');
  body.classList.remove('full-day-mode', 'time-mode');
  
  showDisabledMessage();
}

/**
 * 調整さん以外で無効メッセージを表示
 * 拡張機能の使用方法について情報を提供するメッセージを作成・表示
 */
function showDisabledMessage() {
  const disabledMessage = createDisabledMessage();
  document.querySelector('.container').appendChild(disabledMessage);
}

/**
 * 無効メッセージ要素を作成
 * @returns {HTMLDivElement} スタイリングされた無効メッセージ要素
 */
function createDisabledMessage() {
  const disabledMessage = document.createElement('div');
  disabledMessage.style.cssText = `
    text-align: center;
    padding: 15px;
    color: #666;
    font-size: 14px;
  `;
  disabledMessage.innerHTML = `
    <p>この拡張機能は<strong>調整さん</strong>でのみ動作します</p>
    <p><a href="https://chouseisan.com/" target="_blank">調整さん</a>にアクセスして拡張機能をご利用ください。</p>
  `;
  return disabledMessage;
}

// ============================================================================
// フォーム処理
// ============================================================================

/**
 * フォーム送信を処理
 * デフォルトのフォーム送信を防止し、データを検証してコンテンツスクリプトに送信
 * @param {Event} e - フォーム送信イベント
 */
function handleFormSubmission(e) {
  e.preventDefault();
  
  const formData = getFormData();
  
  if (!validateFormData(formData)) return;
  
  sendDataToContentScript(formData);
}

/**
 * すべてのフォームデータをオブジェクトに収集
 * @returns {Object} すべてのフィールド値を持つフォームデータオブジェクト
 */
function getFormData() {
  return {
    eventTitle: document.getElementById('eventTitle').value,
    memo: document.getElementById('memo').value,
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
    startTime: document.getElementById('startTime').value,
    endTime: document.getElementById('endTime').value,
    duration: document.getElementById('duration').value,
    fullDay: document.getElementById('fullDay').checked,
    overwrite: document.getElementById('overwrite').checked,
    excludeHolidays: document.getElementById('excludeHolidays').checked
  };
}

// ============================================================================
// 検証
// ============================================================================

/**
 * すべてのフォームデータを検証
 * 必須フィールド、日付範囲、時間範囲をチェック
 * @param {Object} formData - 検証するフォームデータオブジェクト
 * @returns {boolean} すべての検証が通った場合true
 */
function validateFormData(formData) {
  if (!isFormComplete(formData)) {
    showStatus("必須項目をすべて入力してください", false);
    return false;
  }
  
  if (!isValidDateRange(formData)) {
    showStatus("終了日は開始日より後に設定してください", false);
    return false;
  }
  
  if (!isValidTimeRange(formData)) {
    showStatus("終了時刻は開始時刻より後に設定してください", false);
    return false;
  }
  
  return true;
}

/**
 * すべての必須フィールドが入力されているかチェック
 * @param {Object} formData - チェックするフォームデータオブジェクト
 * @returns {boolean} すべての必須フィールドに値がある場合true
 */
function isFormComplete(formData) {
  const basicFields = formData.eventTitle && 
                     formData.startDate && 
                     formData.endDate;
  
  if (formData.fullDay) {
    // 終日イベントの場合：時間フィールドは不要
    return basicFields;
  } else {
    // 通常イベントの場合：時間フィールドも必要
    return basicFields && 
           formData.startTime && 
           formData.endTime && 
           formData.duration;
  }
}

/**
 * 終了日が開始日より前でないことを検証
 * @param {Object} formData - 検証するフォームデータオブジェクト
 * @returns {boolean} 日付範囲が有効な場合true
 */
function isValidDateRange(formData) {
  return formData.startDate <= formData.endDate;
}

/**
 * 同日イベントの時間範囲を検証
 * 異なる日付の場合、時間範囲は重要ではない
 * @param {Object} formData - 検証するフォームデータオブジェクト
 * @returns {boolean} 時間範囲が有効な場合true
 */
function isValidTimeRange(formData) {
  // 終日イベントの場合：時間範囲の検証は不要
  if (formData.fullDay) {
    return true;
  }
  
  if (formData.startDate !== formData.endDate) {
    return true; // 異なる日付の場合、時間範囲は重要ではない
  }
  return formData.startTime < formData.endTime;
}

// ============================================================================
// コンテンツスクリプト通信
// ============================================================================

/**
 * フォームデータをコンテンツスクリプトに送信
 * 現在のタブをクエリし、調整さん上の場合にデータを送信
 * @param {Object} formData - コンテンツスクリプトに送信するフォームデータ
 */
function sendDataToContentScript(formData) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    
    if (isChouseisanSite(currentUrl)) {
      sendMessageToContentScript(tabs[0].id, formData);
    }
  });
}

/**
 * フォームデータとともにコンテンツスクリプトにメッセージを送信
 * @param {number} tabId - メッセージを送信するタブのID
 * @param {Object} formData - 送信するフォームデータ
 */
function sendMessageToContentScript(tabId, formData) {
  chrome.tabs.sendMessage(tabId, {
    action: "scheduleSubmitted", 
    data: formData
  }, handleContentScriptResponse);
}

/**
 * コンテンツスクリプトからの応答を処理
 * 応答に基づいて適切な成功またはエラーメッセージを表示
 * @param {Object} response - コンテンツスクリプトからの応答
 */
function handleContentScriptResponse(response) {
  if (chrome.runtime.lastError) {
    handleCommunicationError(chrome.runtime.lastError);
  } else if (response && response.success) {
    showStatus("スケジュールが追加されました！", true);
  } else if (response && !response.success) {
    showStatus("エラー: " + (response.message || "スケジュール入力欄が見つかりませんでした"), false);
  } else {
    showStatus("エラー: コンテンツスクリプトからの応答がありません", false);
  }
}

/**
 * コンテンツスクリプトとの通信エラーを処理
 * エラータイプに基づいて適切なエラーメッセージを表示
 * @param {Error} error - chrome.runtime.lastErrorからのエラーオブジェクト
 */
function handleCommunicationError(error) {
  if (error.message.includes('Could not establish connection')) {
    showStatus("エラー: コンテンツスクリプトが読み込まれていません。ページを更新して再試行してください。", false);
  } else {
    showStatus("エラー: ページとの通信に失敗しました。ページを更新してください。", false);
  }
} 