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
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
    return sendResponse({ success: false, message: '無効なデータが送信されました' });
  }
  const missingFields = getMissingFields(scheduleData);
  if (missingFields.length > 0) {
    return sendResponse({ success: false, message: `必須フィールドが不足しています: ${missingFields.join(', ')}` });
  }
  const elements = {
    nameInput: document.getElementById('name'),
    commentInput: document.getElementById('comment'),
    kouhoTextarea: document.getElementById('kouho'),
  };
  const result = await fillFormElements(elements, scheduleData);
  sendResponse(createResponse(result, elements));
};

/** 不足している必須フィールドを取得 */
const getMissingFields = (data) => {
  const missing = BASIC_REQUIRED_FIELDS.filter((field) => !data[field]);
  !data.fullDay && missing.push(...TIME_REQUIRED_FIELDS.filter((field) => !data[field]));
  return missing;
};

/** レスポンスオブジェクトを作成 */
const createResponse = (result, elements) => {
  if (elements.kouhoTextarea && result.successCount > 0) {
    const message = result.successCount === result.totalFields
      ? 'すべての項目が正常に入力されました！'
      : `${result.totalFields}個中${result.successCount}個の項目が正常に入力されました`;
    return { success: true, message };
  }
  const elementsExist = elements.nameInput || elements.commentInput || elements.kouhoTextarea;
  return {
    success: false,
    message: elementsExist
      ? 'スケジュールの入力に失敗しました。データを確認してください。'
      : '調整さんの入力欄が見つかりませんでした。ページが正しく読み込まれているか確認してください。',
  };
};

/** フォーム要素を入力 */
const fillFormElements = async (elements, data) => {
  let successCount = 0;
  const fields = [
    () => elements.nameInput && fillInputElement(elements.nameInput, data.eventTitle),
    () => elements.commentInput && fillInputElement(elements.commentInput, data.memo || ''),
    () => elements.kouhoTextarea && fillScheduleTextarea(elements.kouhoTextarea, data),
  ];
  for (const field of fields) {
    await field() && successCount++;
  }
  return { successCount, totalFields: fields.length };
};

/** スケジュールテキストエリアを入力 */
const fillScheduleTextarea = async (textarea, data) => {
  const formatted = await formatScheduleForChouseisan(data);
  const content = data.overwrite ? formatted : (textarea.value ? `${textarea.value}\n${formatted}` : formatted);
  return fillInputElement(textarea, content);
};

/** 入力要素に値を設定 */
const fillInputElement = (element, value) => {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

/** 調整さん用にスケジュールをフォーマット */
const formatScheduleForChouseisan = async (data) => {
  const [startDate, endDate] = [new Date(data.startDate), new Date(data.endDate)];
  const timeSlots = data.fullDay ? null : generateTimeSlots(data.startTime, data.endTime, parseInt(data.duration));
  const lines = await generateScheduleLines(startDate, endDate, timeSlots, data.excludeHolidays);
  return lines.join('\n');
};

/** 時間スロットを生成 */
const generateTimeSlots = (startTime, endTime, durationMinutes) => {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  let end = new Date(`2000-01-01T${endTime}`);
  if (start >= end) end.setDate(end.getDate() + 1);
  let current = new Date(start);
  while (current < end) {
    const slotEnd = new Date(current.getTime() + durationMinutes * 60000);
    slotEnd <= end && slots.push(`${formatTime(current)} ~ ${formatTime(slotEnd)}`);
    current.setMinutes(current.getMinutes() + durationMinutes);
  }
  return slots;
};

/** スケジュール行を生成 */
const generateScheduleLines = async (startDate, endDate, timeSlots, excludeHolidays = false) => {
  const lines = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);
  while (currentDate <= lastDate) {
    if (!excludeHolidays || !(await isWeekendOrHoliday(currentDate))) {
      const dateStr = formatJapaneseDate(currentDate);
      timeSlots ? timeSlots.forEach((slot) => lines.push(`${dateStr} ${slot}`)) : lines.push(dateStr);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return lines;
};

/** 時間をフォーマット (HH:MM) */
const formatTime = (time) => time.toTimeString().slice(0, 5);
/** 日本語の日付をフォーマット (M/D(曜日)) */
const formatJapaneseDate = (date) => `${date.getMonth() + 1}/${date.getDate()}(${JAPANESE_WEEKDAYS[date.getDay()]})`;

/** 土日祝日かチェック */
const isWeekendOrHoliday = async (date) => {
  const day = date.getDay();
  return day === 0 || day === 6 || await isJapaneseHoliday(date);
};

/** 日本の祝日かチェック */
const isJapaneseHoliday = async (date) => {
  const holidays = await getHolidaysForYear(date.getFullYear());
  return holidays.includes(formatDateString(date));
};

/** 年の祝日データを取得 */
const getHolidaysForYear = async (year) => {
  if (holidayCache[year]) return holidayCache[year];
  try {
    const response = await fetch(`${HOLIDAYS_API_BASE_URL}/${year}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const holidays = data?.holidays?.map((h) => h.date) || (Array.isArray(data) ? data.map((h) => h.date || h) : []);
    return holidayCache[year] = holidays;
  } catch {
    console.error(`祝日データの取得に失敗しました (${year}年)`);
    return holidayCache[year] = [];
  }
};

/** 日付文字列をフォーマット (YYYY-MM-DD) */
const formatDateString = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
