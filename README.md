# 調整さん拡張機能

調整さん（chouseisan.com）でスケジュール作成を簡単にするChrome拡張機能です。

## 機能

- イベント名、メモ、スケジュールの自動入力
- 時間枠選択（30分、1時間、1時間30分、2時間）
- 終日イベント対応
- 土日祝日の自動除外
- フォームデータの自動保存

## インストール

1. Chromeを開いて `chrome://extensions/` にアクセス
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. 拡張機能ファイルが含まれるフォルダを選択

## 使用方法

1. 調整さん（https://chouseisan.com/）にアクセス
2. 拡張機能アイコンをクリック
3. フォームに入力して「スケジュールを送信」をクリック

## ファイル構成

```
├── manifest.json
├── README.md
├── js/
│   ├── content.js
│   └── popup.js
├── css/
│   └── popup.css
├── html/
│   └── popup.html
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── tools/
    └── create_icons.html
```
