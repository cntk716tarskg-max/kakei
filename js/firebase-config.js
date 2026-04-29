/* =====================================================
   firebase-config.js — Firebase プロジェクト設定
   ★ セットアップ手順は下記コメントを参照してください
   ===================================================== */

/*
  ══════════════════════════════════════════════════════
  【Firestore セットアップ手順】

  ① Firebase プロジェクトを作成
     1. https://console.firebase.google.com/ を開く
     2. 「プロジェクトを追加」→ 名前（例: kakei-plus）を入力
     3. Google アナリティクスは任意でOFF → 「プロジェクトを作成」

  ② ウェブアプリを登録
     1. プロジェクトのトップ画面で「</>」(ウェブ) アイコンをクリック
     2. アプリ名を入力（例: kakei-web）→「アプリを登録」
     3. 表示された firebaseConfig オブジェクトをコピーして
        下の FIREBASE_CONFIG に貼り付ける

  ③ Firestore Database を有効化
     1. 左メニュー「Firestore Database」→「データベースを作成」
     2. 「テストモードで開始」を選択（後でルールを変更する）
     3. ロケーションは「asia-northeast1」(東京) を推奨

  ④ 匿名認証を有効化
     1. 左メニュー「Authentication」→「始める」
     2. 「ログイン方法」タブ→「匿名」→「有効にする」→「保存」

  ⑤ セキュリティルールを設定（Firestore）
     左メニュー「Firestore Database」→「ルール」タブで以下に書き換え:

     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{userId}/{document=**} {
           allow read, write: if request.auth != null
                              && request.auth.uid == userId;
         }
       }
     }

     ※ これにより「ログインした本人のデータだけ読み書きできる」ルールになります

  ⑥ index.html の Firebase CDN コメントを解除
     index.html の「Firebase SDK」と書かれた3行の <!-- --> を外す

  ⑦ 下の USE_FIRESTORE を true に変更して完了
  ══════════════════════════════════════════════════════
*/

// ② で取得した設定値をここに貼り付ける
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB84wy7u7Gp9RWWolcAAuUkxzXnWc84IlE",
  authDomain: "kakei-ad3f5.firebaseapp.com",
  projectId: "kakei-ad3f5",
  storageBucket: "kakei-ad3f5.firebasestorage.app",
  messagingSenderId: "839626386209",
  appId: "1:839626386209:web:a25b70ca3d717c1b75ac60"
};

// ⑦ 設定が完了したら true に変更する（false = LocalStorage のみで動作）
const USE_FIRESTORE = true;
