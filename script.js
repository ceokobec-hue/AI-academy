function getToastStack() {
  const el = document.querySelector(".toast-stack");
  if (!el) throw new Error("Toast stack not found");
  return el;
}

function showToast({ title = "알림", message, durationMs = 2200 }) {
  const stack = getToastStack();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const t = document.createElement("p");
  t.className = "toast-title";
  t.textContent = title;

  const b = document.createElement("p");
  b.className = "toast-body";
  b.textContent = message;

  toast.append(t, b);
  stack.appendChild(toast);

  const remove = () => {
    toast.style.animation = "toast-out 140ms ease forwards";
    window.setTimeout(() => toast.remove(), 150);
  };

  window.setTimeout(remove, durationMs);
}

function wireNavToasts() {
  document.querySelectorAll("[data-toast]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const msg = el.getAttribute("data-toast") || "준비 중입니다.";
      showToast({ title: "준비중", message: msg });
    });
  });
}

function wireHeroButtons() {
  const enroll = document.getElementById("btnEnroll");
  const trial = document.getElementById("btnTrial");

  enroll?.addEventListener("click", () => {
    showToast({
      title: "수강",
      message: "수강 페이지 연결은 다음 단계에서 붙일게요.",
    });
  });

  trial?.addEventListener("click", () => {
    showToast({
      title: "무료 체험",
      message: "체험 플로우는 다음 단계에서 하나씩 추가하겠습니다.",
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireNavToasts();
  wireHeroButtons();
});

