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

// Mobile nav drawer fallback (works even if module scripts fail)
function wireMobileNavDrawerFallback() {
  const nav = document.querySelector("nav.nav");
  const headerInner = document.querySelector(".header-inner");
  if (!nav || !headerInner) return;

  if (!nav.id) nav.id = "siteNav";

  let backdrop = document.querySelector(".nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
  }

  let toggle = document.querySelector("[data-nav-toggle]");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.dataset.navToggle = "true";
    toggle.setAttribute("aria-label", "메뉴 열기");
    toggle.setAttribute("aria-controls", nav.id);
    toggle.setAttribute("aria-expanded", "false");
    // Add inline styles for better mobile interaction
    toggle.style.cssText = "touch-action: manipulation; -webkit-tap-highlight-color: transparent;";
    toggle.innerHTML = `
      <span class="nav-toggle-lines" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    `;
    headerInner.appendChild(toggle);
  }

  const root = document.documentElement;
  const isOpen = () => root.classList.contains("nav-open");
  const open = () => {
    root.classList.add("nav-open");
    const btn = document.querySelector("[data-nav-toggle]");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "메뉴 닫기");
    }
  };
  const close = () => {
    root.classList.remove("nav-open");
    const btn = document.querySelector("[data-nav-toggle]");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "메뉴 열기");
    }
  };

  // Avoid double-wiring
  if (document.body.dataset.mobileNavWired === "1") return;
  document.body.dataset.mobileNavWired = "1";

  // Handler function for toggle
  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen()) {
      close();
    } else {
      open();
    }
  };

  // Handler for backdrop
  const handleBackdrop = () => {
    close();
  };

  // Handler for nav links
  const handleNavLink = () => {
    window.setTimeout(close, 0);
  };

  // Direct event listeners on toggle button (both click and touchstart for mobile)
  if (toggle) {
    toggle.addEventListener("click", handleToggle);
    toggle.addEventListener("touchstart", (e) => {
      // Prevent double-firing on mobile
      e.preventDefault();
      handleToggle(e);
    }, { passive: false });
  }

  // Backdrop listeners
  if (backdrop) {
    backdrop.addEventListener("click", handleBackdrop);
    backdrop.addEventListener("touchstart", (e) => {
      e.preventDefault();
      handleBackdrop();
    }, { passive: false });
  }

  // Nav link listeners
  nav.addEventListener("click", (e) => {
    if (!isOpen()) return;
    const link = e.target?.closest?.("a");
    if (link) {
      handleNavLink();
    }
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      close();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireMobileNavDrawerFallback();
  wireNavToasts();
  wireHeroButtons();
});

