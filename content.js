/**
 * 調整さん用Chrome拡張機能
 * 調整さんページとの対話を行うコンテンツスクリプト
 * @file content.js
 */

// ============================================================================
// 定数
// ============================================================================

/** @const {Array<string>} 日本語の曜日略称 */
const JAPANESE_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** @const {Array<string>} スケジュール送信に必要なフィールド */
const REQUIRED_FIELDS = ['eventTitle', 'startDate', 'endDate', 'startTime', 'endTime', 'duration'];

/** @const {string} 日本の祝日APIのベースURL */
const HOLIDAYS_API_BASE_URL = 'https://holidays-jp.shogo82148.com';

/** @type {Object<number, Array<string>>} 祝日データのキャッシュ（年 -> 祝日配列） */
const holidayCache = {};

// ============================================================================
// メッセージ処理
// ============================================================================

/**
 * ポップアップスクリプトからのメッセージをリッスン
 * スケジュール送信リクエストを処理し、結果を応答
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scheduleSubmitted") {
    handleScheduleSubmission(request.data, sendResponse);
  } else {
    sendResponse({success: false, message: "不明なアクション"});
  }
  
  return true; // 非同期応答を示す
});

// ============================================================================
// スケジュール送信処理
// ============================================================================

/**
 * ポップアップからのスケジュール送信を処理
 * データを検証し、フォーム要素を埋めて応答を送信
 * @param {Object} scheduleData - ポップアップからのスケジュールデータ
 * @param {Function} sendResponse - ポップアップに応答を送信する関数
 */
async function handleScheduleSubmission(scheduleData, sendResponse) {
  if (!isValidScheduleData(scheduleData)) {
    sendResponse({success: false, message: "無効なデータが送信されました"});
    return;
  }
  
  const missingFields = getMissingFields(scheduleData);
  if (missingFields.length > 0) {
    sendResponse({success: false, message: `必須フィールドが不足しています: ${missingFields.join(', ')}`});
    return;
  }
  
  const formElements = findFormElements();
  const result = await fillFormElements(formElements, scheduleData);
  
  sendResponse(createResponse(result, formElements));
}

/**
 * スケジュールデータが有効なオブジェクトかどうかを検証
 * @param {Object} scheduleData - 検証するスケジュールデータ
 * @returns {boolean} データが有効な場合true
 */
function isValidScheduleData(scheduleData) {
  return scheduleData && typeof scheduleData === 'object';
}

/**
 * 不足している必須フィールドのリストを取得
 * @param {Object} scheduleData - チェックするスケジュールデータ
 * @returns {Array<string>} 不足しているフィールド名の配列
 */
function getMissingFields(scheduleData) {
  return REQUIRED_FIELDS.filter(field => !scheduleData[field]);
}

/**
 * フォーム埋め結果に基づいて応答オブジェクトを作成
 * @param {Object} result - fillFormElementsからの結果
 * @param {Object} formElements - ページで見つかったフォーム要素
 * @returns {Object} 成功ステータスとメッセージを持つ応答オブジェクト
 */
function createResponse(result, formElements) {
  const kouhoFilled = formElements.kouhoTextarea && result.successCount > 0;
  
  if (kouhoFilled) {
    const successMessage = result.successCount === result.totalFields 
      ? "すべての項目が正常に入力されました！"
      : `${result.totalFields}個中${result.successCount}個の項目が正常に入力されました`;
    
    return {success: true, message: successMessage};
  } else {
    return createErrorResponse(formElements);
  }
}

/**
 * フォーム要素の可用性に基づいてエラー応答を作成
 * @param {Object} formElements - ページで見つかったフォーム要素
 * @returns {Object} エラー応答オブジェクト
 */
function createErrorResponse(formElements) {
  const elementsExist = formElements.nameInput || formElements.commentInput || formElements.kouhoTextarea;
  
  if (!elementsExist) {
    return {success: false, message: "調整さんの入力欄が見つかりませんでした。ページが正しく読み込まれているか確認してください。"};
  } else {
    return {success: false, message: "スケジュールの入力に失敗しました。データを確認してください。"};
  }
}

// ============================================================================
// フォーム要素管理
// ============================================================================

/**
 * 調整さんページでフォーム要素を検索
 * @returns {Object} フォーム要素参照を含むオブジェクト
 */
function findFormElements() {
  return {
    nameInput: document.getElementById('name'),
    commentInput: document.getElementById('comment'),
    kouhoTextarea: document.getElementById('kouho')
  };
}

/**
 * スケジュールデータでフォーム要素を埋める
 * @param {Object} elements - 埋めるフォーム要素
 * @param {Object} scheduleData - 使用するスケジュールデータ
 * @returns {Promise<Object>} 成功数と総フィールド数を持つ結果オブジェクト
 */
async function fillFormElements(elements, scheduleData) {
  let successCount = 0;
  let totalFields = 0;
  
  // イベント名を埋める
  if (elements.nameInput) {
    fillInputElement(elements.nameInput, scheduleData.eventTitle);
    successCount++;
  }
  totalFields++;
  
  // メモを埋める
  if (elements.commentInput) {
    fillInputElement(elements.commentInput, scheduleData.memo || '');
    successCount++;
  }
  totalFields++;
  
  // スケジュールを埋める
  if (elements.kouhoTextarea) {
    await fillScheduleTextarea(elements.kouhoTextarea, scheduleData);
    successCount++;
  }
  totalFields++;
  
  return { successCount, totalFields };
}

/**
 * フォーマットされたスケジュールデータでスケジュールテキストエリアを埋める
 * チェックボックス選択に基づいて上書きvs追加モードを処理
 * @param {HTMLTextAreaElement} textarea - 埋めるテキストエリア要素
 * @param {Object} scheduleData - 上書きフラグを含むスケジュールデータ
 */
async function fillScheduleTextarea(textarea, scheduleData) {
  const formattedSchedule = await formatScheduleForChouseisan(scheduleData);
  
  if (scheduleData.overwrite) {
    // 上書き：既存のコンテンツを置き換え
    fillInputElement(textarea, formattedSchedule);
  } else {
    // 追加：既存のコンテンツに新しいスケジュールを追加
    const existingContent = textarea.value || '';
    const newContent = existingContent ? existingContent + '\n' + formattedSchedule : formattedSchedule;
    fillInputElement(textarea, newContent);
  }
}

/**
 * 入力要素に値を設定し、入力イベントをトリガー
 * @param {HTMLElement} element - 埋める入力要素
 * @param {string} value - 設定する値
 */
function fillInputElement(element, value) {
  element.value = value;
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
}

// ============================================================================
// スケジュールフォーマット
// ============================================================================

/**
 * 調整さんテキストエリア用にスケジュールデータをフォーマット
 * スケジュールデータを日本語の日付/時刻形式に変換
 * @param {Object} scheduleData - フォーマットするスケジュールデータ
 * @returns {Promise<string>} フォーマットされたスケジュール文字列
 */
async function formatScheduleForChouseisan(scheduleData) {
  const { startDate, endDate, startTime, endTime, duration, excludeHolidays } = scheduleData;
  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);
  const parsedDuration = parseInt(duration);
  
  const timeSlots = generateTimeSlots(startTime, endTime, parsedDuration);
  const scheduleLines = await generateScheduleLines(parsedStartDate, parsedEndDate, timeSlots, excludeHolidays);
  
  return scheduleLines.join('\n');
}

/**
 * 時間枠に基づいてタイムスロットを生成
 * 指定された時間範囲内に収まるタイムスロットを作成
 * @param {string} startTime - HH:MM形式の開始時刻
 * @param {string} endTime - HH:MM形式の終了時刻
 * @param {number} durationMinutes - 各スロットの時間（分）
 * @returns {Array<string>} タイムスロット文字列の配列
 */
function generateTimeSlots(startTime, endTime, durationMinutes) {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  
  let current = new Date(start);
  
  while (current < end) {
    const slotStart = formatTime(current);
    const slotEndTime = new Date(current.getTime() + durationMinutes * 60000);
    
    // 終了時刻を超えない場合のみスロットを追加
    if (slotEndTime <= end) {
      const slotEnd = formatTime(slotEndTime);
      slots.push(`${slotStart} ~ ${slotEnd}`);
    }
    
    // 次のスロットに移動
    current.setMinutes(current.getMinutes() + durationMinutes);
  }
  
  return slots;
}

/**
 * 範囲内の各日付のスケジュール行を生成
 * @param {Date} startDate - 開始日
 * @param {Date} endDate - 終了日
 * @param {Array<string>} timeSlots - 各日付に適用するタイムスロット
 * @param {boolean} excludeHolidays - 土日祝日を除外するかどうか
 * @returns {Promise<Array<string>>} フォーマットされたスケジュール行の配列
 */
async function generateScheduleLines(startDate, endDate, timeSlots, excludeHolidays = false) {
  const scheduleLines = [];
  
  if (isSameDate(startDate, endDate)) {
    // 単一日：1日のスロットを生成
    if (!excludeHolidays || !(await isWeekendOrHoliday(startDate))) {
      const dateStr = formatJapaneseDate(startDate);
      timeSlots.forEach(slot => {
        scheduleLines.push(`${dateStr} ${slot}`);
      });
    }
  } else {
    // 複数日：範囲内の各日のスロットを生成
    await generateMultiDaySchedule(startDate, endDate, timeSlots, scheduleLines, excludeHolidays);
  }
  
  return scheduleLines;
}

/**
 * 2つの日付が同じ日かどうかをチェック
 * @param {Date} date1 - 比較する最初の日付
 * @param {Date} date2 - 比較する2番目の日付
 * @returns {boolean} 日付が同じ日の場合true
 */
function isSameDate(date1, date2) {
  return date1.toDateString() === date2.toDateString();
}

/**
 * 複数日のスケジュールを生成
 * @param {Date} startDate - 開始日
 * @param {Date} endDate - 終了日
 * @param {Array<string>} timeSlots - 適用するタイムスロット
 * @param {Array<string>} scheduleLines - スケジュール行を格納する配列
 * @param {boolean} excludeHolidays - 土日祝日を除外するかどうか
 */
async function generateMultiDaySchedule(startDate, endDate, timeSlots, scheduleLines, excludeHolidays = false) {
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);
  
  while (currentDate <= lastDate) {
    // 土日祝日除外が有効で、かつ土日祝日の場合はスキップ
    if (!excludeHolidays || !(await isWeekendOrHoliday(currentDate))) {
      const dateStr = formatJapaneseDate(currentDate);
      timeSlots.forEach(slot => {
        scheduleLines.push(`${dateStr} ${slot}`);
      });
    }
    
    // 次の日に移動
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 時刻をHH:MM文字列としてフォーマット
 * @param {Date} time - フォーマットするDateオブジェクト
 * @returns {string} HH:MM形式の時刻
 */
function formatTime(time) {
  return time.toTimeString().slice(0, 5);
}

/**
 * 日本語の曜日略称を取得
 * @param {Date} date - 曜日を取得する日付
 * @returns {string} 日本語の曜日略称
 */
function getJapaneseWeekday(date) {
  return JAPANESE_WEEKDAYS[date.getDay()];
}

/**
 * 日本語形式で日付をフォーマット（M/D(曜日)）
 * @param {Date} date - フォーマットする日付
 * @returns {string} 日本語形式の日付
 */
function formatJapaneseDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = getJapaneseWeekday(date);
  return `${month}/${day}(${weekday})`;
}

/**
 * 指定された日付が土日または祝日かどうかをチェック
 * @param {Date} date - チェックする日付
 * @returns {Promise<boolean>} 土日または祝日の場合true
 */
async function isWeekendOrHoliday(date) {
  const isWeekendDay = isWeekend(date);
  const isHoliday = await isJapaneseHoliday(date);
  const result = isWeekendDay || isHoliday;
  return result;
}

/**
 * 指定された日付が土日かどうかをチェック
 * @param {Date} date - チェックする日付
 * @returns {boolean} 土日の場合true
 */
function isWeekend(date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 日曜日(0)または土曜日(6)
}

/**
 * 指定された日付が日本の祝日かどうかをチェック
 * @param {Date} date - チェックする日付
 * @returns {Promise<boolean>} 祝日の場合true
 */
async function isJapaneseHoliday(date) {
  const dateString = formatDateString(date);
  const year = date.getFullYear();
  
  try {
    // 年別の祝日リストを取得
    const holidays = await getHolidaysForYear(year);
    const isHoliday = holidays.includes(dateString);
    return isHoliday;
  } catch (error) {
    console.warn('祝日データの取得に失敗しました:', error);
    return false; // エラーの場合は祝日でないとみなす
  }
}

/**
 * 指定された年に対応する祝日リストをAPIから取得
 * @param {number} year - 年
 * @returns {Promise<Array<string>>} 祝日の日付文字列配列
 */
async function getHolidaysForYear(year) {
  // キャッシュから取得を試行
  if (holidayCache[year]) {
    return holidayCache[year];
  }
  
  try {
    const response = await fetch(`${HOLIDAYS_API_BASE_URL}/${year}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    // APIレスポンスの形式に応じて祝日リストを抽出
    let holidays = [];
    
    if (data && data.holidays && Array.isArray(data.holidays)) {
      // holidays-jp API形式: {holidays: [{date: "2024-01-01", name: "元日"}, ...]}
      holidays = data.holidays.map(holiday => holiday.date);
    } else if (Array.isArray(data)) {
      // 配列形式の場合
      holidays = data.map(holiday => holiday.date || holiday);
    } else if (typeof data === 'object' && data !== null) {
      // オブジェクト形式の場合（キーが日付）
      holidays = Object.keys(data);
    } else {
      console.warn(`予期しないAPIレスポンス形式: ${typeof data}`);
    }
    
    // キャッシュに保存
    holidayCache[year] = holidays;
    
    return holidays;
  } catch (error) {
    console.error(`祝日データの取得に失敗しました (${year}年):`, error);
  }
}

/**
 * 日付をYYYY-MM-DD形式の文字列にフォーマット
 * @param {Date} date - フォーマットする日付
 * @returns {string} YYYY-MM-DD形式の日付文字列
 */
function formatDateString(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
} 