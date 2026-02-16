// Firestore에 직접 isFree: true 추가하는 스크립트
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCbVPbM6mi0oNy_aPGhcZr-wSa5ByPpVFM",
  authDomain: "aiacademy-36b79.firebaseapp.com",
  projectId: "aiacademy-36b79",
  storageBucket: "aiacademy-36b79.firebasestorage.app",
  messagingSenderId: "1061803881843",
  appId: "1:1061803881843:web:7d1c7ffba2c68ad9835ef7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixFreeLesson() {
  try {
    const courseId = 'MaxPhfaxduGUIdPzFte4';
    const lessonId = 'fCyDtbvnMvQoLzhqncvp';
    
    const lessonRef = doc(db, 'courses', courseId, 'lessons', lessonId);
    
    await updateDoc(lessonRef, {
      isFree: true
    });
    
    console.log('✅ 성공! isFree: true로 업데이트되었습니다.');
    process.exit(0);
  } catch (e) {
    console.error('❌ 에러:', e.message);
    process.exit(1);
  }
}

fixFreeLesson();
