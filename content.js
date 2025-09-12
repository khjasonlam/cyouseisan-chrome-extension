/** 日本語の曜日 */
const JAPANESE_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
/** 必須フィールド */
const BASIC_REQUIRED_FIELDS = ['eventTitle', 'startDate', 'endDate'];
/** 時間必須フィールド */
const TIME_REQUIRED_FIELDS = ['startTime', 'endTime', 'duration'];
/** 祝日APIのベースURL */
const HOLIDAYS_API_BASE_URL = 'https://holidays-jp.shogo82148.com';

/** 祝日キャッシュ */
const holidayCache = {};

/** メッセージリスナー */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scheduleSubmitted') {
    handleScheduleSubmission(request.data, sendResponse);
  } else {
    sendResponse({ success: false, message: '不明なアクション' });
  }
  return true;
});

/** スケジュール送信処理 */
const handleScheduleSubmission = async (scheduleData, sendResponse) => {
  if (!scheduleData || typeof scheduleData !== 'object') {
    sendResponse({ success: false, message: '無効なデータが送信されました' });
    return;
  }
  const missingFields = getMissingFields(scheduleData);
  if (missingFields.length > 0) {
    sendResponse({
      success: false,
      message: `必須フィールドが不足しています: ${missingFields.join(', ')}`,
    });
    return;
  }
  const formElements = findFormElements();
  const result = await fillFormElements(formElements, scheduleData);
  sendResponse(createResponse(result, formElements));
};

/** 不足している必須フィールドを取得 */
const getMissingFields = (scheduleData) => {
  const missingBasicFields = BASIC_REQUIRED_FIELDS.filter((field) => !scheduleData[field]);
  if (!scheduleData.fullDay) {
    const missingTimeFields = TIME_REQUIRED_FIELDS.filter((field) => !scheduleData[field]);
    return [...missingBasicFields, ...missingTimeFields];
  }
  return missingBasicFields;
};

/** レスポンスオブジェクトを作成 */
const createResponse = (result, formElements) => {
  const kouhoFilled = formElements.kouhoTextarea && result.successCount > 0;
  if (kouhoFilled) {
    const successMessage =
      result.successCount === result.totalFields
        ? 'すべての項目が正常に入力されました！'
        : `${result.totalFields}個中${result.successCount}個の項目が正常に入力されました`;
    return { success: true, message: successMessage };
  } else {
    return createErrorResponse(formElements);
  }
};

/** エラーレスポンスを作成 */
const createErrorResponse = (formElements) => {
  const elementsExist = formElements.nameInput || formElements.commentInput || formElements.kouhoTextarea;
  if (!elementsExist) {
    return {
      success: false,
      message: '調整さんの入力欄が見つかりませんでした。ページが正しく読み込まれているか確認してください。',
    };
  } else {
    return {
      success: false,
      message: 'スケジュールの入力に失敗しました。データを確認してください。',
    };
  }
};

/** フォーム要素を検索 */
const findFormElements = () => {
  return {
    nameInput: document.getElementById('name'),
    commentInput: document.getElementById('comment'),
    kouhoTextarea: document.getElementById('kouho'),
  };
};

/** フォーム要素を入力 */
const fillFormElements = async (elements, scheduleData) => {
  let successCount = 0;
  let totalFields = 0;
  // 名前フィールド
  if (elements.nameInput) {
    fillInputElement(elements.nameInput, scheduleData.eventTitle);
    successCount++;
  }
  totalFields++;
  // コメントフィールド
  if (elements.commentInput) {
    fillInputElement(elements.commentInput, scheduleData.memo || '');
    successCount++;
  }
  totalFields++;
  // 候補日フィールド
  if (elements.kouhoTextarea) {
    await fillScheduleTextarea(elements.kouhoTextarea, scheduleData);
    successCount++;
  }
  totalFields++;
  return { successCount, totalFields };
};

/** スケジュールテキストエリアを入力 */
const fillScheduleTextarea = async (textarea, scheduleData) => {
  const formattedSchedule = await formatScheduleForChouseisan(scheduleData);
  if (scheduleData.overwrite) {
    fillInputElement(textarea, formattedSchedule);
  } else {
    const existingContent = textarea.value || '';
    const newContent = existingContent ? existingContent + '\n' + formattedSchedule : formattedSchedule;
    fillInputElement(textarea, newContent);
  }
};

/** 入力要素に値を設定 */
const fillInputElement = (element, value) => {
  element.value = value;
  const inputEvent = new Event('input', { bubbles: true });
  element.dispatchEvent(inputEvent);
};

/** 調整さん用にスケジュールをフォーマット */
const formatScheduleForChouseisan = async (scheduleData) => {
  const { startDate, endDate, startTime, endTime, duration, fullDay, excludeHolidays } = scheduleData;
  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);
  if (fullDay) {
    const scheduleLines = await generateFullDaySchedule(parsedStartDate, parsedEndDate, excludeHolidays);
    return scheduleLines.join('\n');
  } else {
    const parsedDuration = parseInt(duration);
    const timeSlots = generateTimeSlots(startTime, endTime, parsedDuration);
    const scheduleLines = await generateScheduleLines(parsedStartDate, parsedEndDate, timeSlots, excludeHolidays);
    return scheduleLines.join('\n');
  }
};

/** 時間スロットを生成 */
const generateTimeSlots = (startTime, endTime, durationMinutes) => {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  let end = new Date(`2000-01-01T${endTime}`);
  if (start >= end) {
    end.setDate(end.getDate() + 1);
  }
  let current = new Date(start);
  while (current < end) {
    const slotStart = formatTime(current);
    const slotEndTime = new Date(current.getTime() + durationMinutes * 60000);
    if (slotEndTime <= end) {
      const slotEnd = formatTime(slotEndTime);
      slots.push(`${slotStart} ~ ${slotEnd}`);
    }
    current.setMinutes(current.getMinutes() + durationMinutes);
  }
  return slots;
};

/** スケジュール行を生成 */
const generateScheduleLines = async (startDate, endDate, timeSlots, excludeHolidays = false) => {
  const scheduleLines = [];
  if (isSameDate(startDate, endDate)) {
    if (!excludeHolidays || !(await isWeekendOrHoliday(startDate))) {
      const dateStr = formatJapaneseDate(startDate);
      timeSlots.forEach((slot) => {
        scheduleLines.push(`${dateStr} ${slot}`);
      });
    }
  } else {
    await generateMultiDaySchedule(startDate, endDate, timeSlots, scheduleLines, excludeHolidays);
  }
  return scheduleLines;
};

/** 2つの日付が同じかチェック */
const isSameDate = (date1, date2) => {
  return date1.toDateString() === date2.toDateString();
};

/** 複数日のスケジュールを生成 */
const generateMultiDaySchedule = async (startDate, endDate, timeSlots, scheduleLines, excludeHolidays = false) => {
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);
  while (currentDate <= lastDate) {
    if (!excludeHolidays || !(await isWeekendOrHoliday(currentDate))) {
      const dateStr = formatJapaneseDate(currentDate);
      timeSlots.forEach((slot) => {
        scheduleLines.push(`${dateStr} ${slot}`);
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
};

/** 終日スケジュールを生成 */
const generateFullDaySchedule = async (startDate, endDate, excludeHolidays = false) => {
  const scheduleLines = [];
  if (isSameDate(startDate, endDate)) {
    if (!excludeHolidays || !(await isWeekendOrHoliday(startDate))) {
      const dateStr = formatJapaneseDate(startDate);
      scheduleLines.push(dateStr);
    }
  } else {
    const currentDate = new Date(startDate);
    const lastDate = new Date(endDate);
    while (currentDate <= lastDate) {
      if (!excludeHolidays || !(await isWeekendOrHoliday(currentDate))) {
        const dateStr = formatJapaneseDate(currentDate);
        scheduleLines.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  return scheduleLines;
};

/** 時間をフォーマット (HH:MM) */
const formatTime = (time) => {
  return time.toTimeString().slice(0, 5);
};

/** 日本語の曜日を取得 */
const getJapaneseWeekday = (date) => {
  return JAPANESE_WEEKDAYS[date.getDay()];
};

/** 日本語の日付をフォーマット (M/D(曜日)) */
const formatJapaneseDate = (date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = getJapaneseWeekday(date);
  return `${month}/${day}(${weekday})`;
};

/** 土日祝日かチェック */
const isWeekendOrHoliday = async (date) => {
  const isWeekendDay = isWeekend(date);
  const isHoliday = await isJapaneseHoliday(date);
  return isWeekendDay || isHoliday;
};

/** 土日かチェック */
const isWeekend = (date) => {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

/** 日本の祝日かチェック */
const isJapaneseHoliday = async (date) => {
  const dateString = formatDateString(date);
  const year = date.getFullYear();
  try {
    const holidays = await getHolidaysForYear(year);
    return holidays.includes(dateString);
  } catch (error) {
    console.warn('祝日データの取得に失敗しました:', error);
    return false;
  }
};

/** 年の祝日データを取得 */
const getHolidaysForYear = async (year) => {
  if (holidayCache[year]) {
    return holidayCache[year];
  }
  try {
    const response = await fetch(`${HOLIDAYS_API_BASE_URL}/${year}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    let holidays = [];
    if (data?.holidays && Array.isArray(data.holidays)) {
      holidays = data.holidays.map((holiday) => holiday.date);
    } else if (Array.isArray(data)) {
      holidays = data.map((holiday) => holiday.date || holiday);
    } else if (typeof data === 'object' && data !== null) {
      holidays = Object.keys(data);
    } else {
      console.warn(`予期しないAPIレスポンス形式: ${typeof data}`);
    }
    holidayCache[year] = holidays;
    return holidays;
  } catch (error) {
    console.error(`祝日データの取得に失敗しました (${year}年):`, error);
    return [];
  }
};

/** 日付文字列をフォーマット (YYYY-MM-DD) */
const formatDateString = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
