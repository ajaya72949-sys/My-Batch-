(() => {
    const RANKING_KEY = "vidyaTest_student_rankings";

    let viewerQuestions = [];
    let viewerIndex = 0;
    let viewerTitle = "";
    let resultHookInstalled = false;
    let lastSavedTest = null;

    function getRankings() {
        try {
            const data = JSON.parse(localStorage.getItem(RANKING_KEY) || "[]");
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getCorrectIndex(question) {
        if (question.correctAnswer !== undefined) return Number(question.correctAnswer);
        if (question.answer !== undefined) return Number(question.answer);
        if (question.correct !== undefined) return Number(question.correct);
        return -1;
    }

    function getAnswerText(question, index) {
        if (index === undefined || index === null) {
            return "Attempt नहीं किया";
        }

        return question.options?.[index] !== undefined
            ? question.options[index]
            : `Option ${Number(index) + 1}`;
    }

    function saveRanking(result) {
        const rankings = getRankings();

        rankings.push({
            id: Date.now(),
            testName: result.testName || "Untitled Test",
            score: Number(result.score || 0),
            maxMarks: Number(result.maxMarks || 0),
            percentage: Number(result.percentage || 0),
            attempted: Number(result.attempted || 0),
            total: Number(result.total || 0),
            questions: Array.isArray(result.questions) ? result.questions : [],
            completedAt: new Date().toLocaleString("hi-IN")
        });

        localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
    }

    function saveCurrentTestToRanking() {
        const questions = Array.isArray(window.currentActiveTestQuestions)
            ? window.currentActiveTestQuestions
            : [];

        const answers = window.userAnswers || {};
        const test = window.currentActiveTest || {};

        if (!questions.length) return;

        // एक ही result को दोबारा save होने से रोकें
        if (lastSavedTest === test && getRankings().some(item =>
            item.testName === test.name &&
            item._sessionId === window.__vidyaTestSessionId
        )) {
            return;
        }

        const positiveMarks = Number(test.positiveMarks ?? 4);
        const negativeMarks = Number(test.negativeMarks ?? 1);

        let correct = 0;
        let incorrect = 0;

        const savedQuestions = questions.map((question, index) => {
            const correctIndex = getCorrectIndex(question);
            const userAnswer = answers[index];

            if (userAnswer !== undefined && userAnswer !== null) {
                if (Number(userAnswer) === correctIndex) correct++;
                else incorrect++;
            }

            return {
                id: question.id || `q_${index + 1}`,
                section: question.section || "General",
                question: question.question || question.q || "",
                q: question.q || question.question || "",
                options: Array.isArray(question.options) ? [...question.options] : [],
                answer: correctIndex,
                correct: correctIndex,
                userAnswer: userAnswer,
                solution: question.solution || question.explanation || ""
            };
        });

        const total = savedQuestions.length;
        const attempted = correct + incorrect;
        const score = (correct * positiveMarks) - (incorrect * negativeMarks);
        const maxMarks = total * positiveMarks;
        const percentage = maxMarks
            ? Math.round((score / maxMarks) * 10000) / 100
            : 0;

        const rankings = getRankings();
        rankings.push({
            id: Date.now(),
            _sessionId: window.__vidyaTestSessionId,
            testName: test.name || "Untitled Test",
            score,
            maxMarks,
            percentage,
            attempted,
            total,
            questions: savedQuestions,
            completedAt: new Date().toLocaleString("hi-IN")
        });

        localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
        lastSavedTest = test;
    }

    function installResultHook() {
        if (resultHookInstalled || typeof window.calculateAndShowResult !== "function") {
            return;
        }

        const originalCalculate = window.calculateAndShowResult;

        window.calculateAndShowResult = function (...args) {
            const result = originalCalculate.apply(this, args);
            saveCurrentTestToRanking();
            return result;
        };

        resultHookInstalled = true;
    }

    function deleteRankingAttempt(displayIndex) {
        const rankings = getRankings();
        const actualIndex = rankings.length - 1 - Number(displayIndex);

        if (actualIndex < 0 || actualIndex >= rankings.length) return;

        const attempt = rankings[actualIndex];

        if (!confirm(`क्या आप "${attempt.testName}" का attempt delete करना चाहते हैं?`)) {
            return;
        }

        rankings.splice(actualIndex, 1);
        localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
        renderRankings();
    }

    function createRankingScreen() {
        if (document.getElementById("screen-ranking")) return;

        const screen = document.createElement("div");
        screen.id = "screen-ranking";
        screen.className = "app-screen";

        screen.innerHTML = `
            <div class="nav-back-header">
                <button class="nav-back-btn" id="rankingBackBtn">
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <h3 style="font-size:14px;">मेरी Ranking</h3>
            </div>
            <div id="rankingList"></div>
        `;

        document.querySelector("#app-view .app-body")?.appendChild(screen);

        document.getElementById("rankingBackBtn").onclick = () => {
            showScreen("screen-home");
        };
    }

    function createSolutionViewer() {
        if (document.getElementById("rankingSolutionViewer")) return;

        const viewer = document.createElement("div");
        viewer.id = "rankingSolutionViewer";

        viewer.innerHTML = `
            <div style="
                position:fixed; inset:0; z-index:5000; background:#f8fafc;
                display:flex; flex-direction:column; max-width:600px; margin:auto;
            ">
                <div style="
                    background:#fff; padding:10px 15px; display:flex;
                    align-items:center; justify-content:space-between;
                    border-bottom:1px solid #e2e8f0;
                ">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button id="rankingViewerClose" class="nav-back-btn">
                            <i class="fa-solid fa-arrow-left"></i>
                        </button>
                        <div>
                            <b style="font-size:14px;">Detailed Solutions</b>
                            <div id="rankingViewerTitle"
                                 style="font-size:10px;color:#64748b;"></div>
                        </div>
                    </div>
                    <b id="rankingViewerCounter"
                       style="font-size:12px;color:#4f46e5;"></b>
                </div>

                <div style="
                    background:#f1f5f9; padding:8px 15px;
                    border-bottom:1px solid #e2e8f0; overflow-x:auto;
                ">
                    <div style="display:flex;gap:6px;" id="rankingViewerJump"></div>
                </div>

                <div id="rankingViewerContent"
                     style="flex:1;overflow-y:auto;padding:15px 15px 80px;"></div>

                <div style="
                    position:fixed; bottom:0; left:50%; transform:translateX(-50%);
                    width:100%; max-width:600px; background:#fff;
                    border-top:1px solid #e2e8f0; padding:10px 15px;
                    display:flex; gap:8px;
                ">
                    <button id="rankingViewerPrev" class="btn-exam-action">
                        Previous
                    </button>
                    <button id="rankingViewerNext"
                            class="btn-exam-action btn-save-next">
                        Next
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(viewer);

        document.getElementById("rankingViewerClose").onclick =
            closeSolutionViewer;

        document.getElementById("rankingViewerPrev").onclick = () => {
            if (viewerIndex > 0) {
                viewerIndex--;
                renderViewerQuestion();
            }
        };

        document.getElementById("rankingViewerNext").onclick = () => {
            if (viewerIndex < viewerQuestions.length - 1) {
                viewerIndex++;
                renderViewerQuestion();
            } else {
                closeSolutionViewer();
            }
        };
    }

    function openSolutionViewer(questions, title) {
        if (!Array.isArray(questions) || questions.length === 0) {
            alert("इस attempt में प्रश्न सेव नहीं हैं।");
            return;
        }

        viewerQuestions = questions;
        viewerIndex = 0;
        viewerTitle = title || "Test Solutions";

        createSolutionViewer();

        document.getElementById("rankingSolutionViewer").style.display = "block";
        renderViewerQuestion();
    }

    function closeSolutionViewer() {
        const viewer = document.getElementById("rankingSolutionViewer");
        if (viewer) viewer.style.display = "none";
    }

    function renderViewerQuestion() {
        const question = viewerQuestions[viewerIndex];
        if (!question) return;

        const correctIndex = getCorrectIndex(question);
        const userIndex = question.userAnswer;
        const isAttempted = userIndex !== undefined && userIndex !== null;
        const isCorrect = isAttempted && Number(userIndex) === correctIndex;

        document.getElementById("rankingViewerTitle").innerText = viewerTitle;
        document.getElementById("rankingViewerCounter").innerText =
            `Q${viewerIndex + 1} / ${viewerQuestions.length}`;

        document.getElementById("rankingViewerContent").innerHTML = `
            <div style="
                background:#fff; border:1px solid #e2e8f0;
                border-radius:10px; padding:15px;
            ">
                <div style="
                    font-size:14px; font-weight:700;
                    line-height:1.6; margin-bottom:18px;
                ">
                    Q${viewerIndex + 1}.
                    ${escapeHtml(question.question || question.q || "प्रश्न उपलब्ध नहीं है")}
                </div>

                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${(question.options || []).map((option, index) => {
                        const selected = Number(userIndex) === index;
                        const correct = correctIndex === index;

                        let background = "#fff";
                        let border = "#e2e8f0";
                        let color = "#334155";
                        let label = "";

                        if (correct) {
                            background = "#f0fdf4";
                            border = "#22c55e";
                            color = "#15803d";
                            label = " ✅ सही उत्तर";
                        } else if (selected) {
                            background = "#fef2f2";
                            border = "#ef4444";
                            color = "#b91c1c";
                            label = " ❌ आपका उत्तर";
                        }

                        return `
                            <div style="
                                background:${background};
                                border:1px solid ${border};
                                color:${color};
                                border-radius:8px;
                                padding:12px 14px;
                                font-size:13px;
                                font-weight:${correct || selected ? 700 : 400};
                            ">
                                <b>${String.fromCharCode(65 + index)}.</b>
                                ${escapeHtml(option)}
                                ${label}
                            </div>
                        `;
                    }).join("")}
                </div>

                <div style="
                    margin-top:15px; padding:10px; border-radius:8px;
                    background:${!isAttempted ? "#f1f5f9" : isCorrect ? "#f0fdf4" : "#fef2f2"};
                    color:${!isAttempted ? "#64748b" : isCorrect ? "#15803d" : "#b91c1c"};
                    font-size:12px; font-weight:700;
                ">
                    ${
                        !isAttempted
                            ? "आपने इस प्रश्न को attempt नहीं किया।"
                            : isCorrect
                                ? "आपका उत्तर सही है।"
                                : `आपका उत्तर: ${escapeHtml(getAnswerText(question, userIndex))}`
                    }
                </div>

                <div style="
                    margin-top:15px; padding:12px; background:#eff6ff;
                    border:1px solid #bfdbfe; border-radius:8px;
                    color:#1e40af; font-size:12px; line-height:1.7;
                ">
                    <b>💡 पूरा Solution / व्याख्या</b>
                    <div style="margin-top:7px;white-space:pre-line;">
                        ${escapeHtml(question.solution || "इस प्रश्न का solution उपलब्ध नहीं है।")}
                    </div>
                </div>
            </div>
        `;

        renderViewerJumpButtons();

        document.getElementById("rankingViewerPrev").disabled = viewerIndex === 0;
        document.getElementById("rankingViewerNext").innerText =
            viewerIndex === viewerQuestions.length - 1 ? "Close" : "Next";
    }

    function renderViewerJumpButtons() {
        const container = document.getElementById("rankingViewerJump");
        if (!container) return;

        container.innerHTML = viewerQuestions.map((_, index) => `
            <button
                onclick="window.openRankingQuestion(${index})"
                style="
                    min-width:30px;height:30px;border-radius:50%;
                    border:1px solid ${index === viewerIndex ? "#4f46e5" : "#cbd5e1"};
                    background:${index === viewerIndex ? "#4f46e5" : "#fff"};
                    color:${index === viewerIndex ? "#fff" : "#334155"};
                    font-size:11px;font-weight:700;cursor:pointer;
                ">
                ${index + 1}
            </button>
        `).join("");

        const active = container.children[viewerIndex];
        active?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center"
        });
    }

    function toggleQuestions(index) {
        const box = document.getElementById(`ranking-questions-${index}`);
        const button = document.getElementById(`ranking-question-btn-${index}`);

        if (!box || !button) return;

        const hidden = box.style.display === "none";
        box.style.display = hidden ? "block" : "none";
        button.innerText = hidden ? "Questions छुपाएं" : "Questions देखें";
    }

    function renderRankings() {
        createRankingScreen();

        const container = document.getElementById("rankingList");
        const rankings = getRankings().slice().reverse();

        if (!rankings.length) {
            container.innerHTML = `
                <div class="admin-card" style="text-align:center;">
                    <p style="font-size:13px;color:#64748b;">
                        अभी कोई टेस्ट Ranking में सेव नहीं है।
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = rankings.map((item, index) => `
            <div class="test-card" style="display:block;cursor:default;">
                <div style="display:flex;justify-content:space-between;">
                    <div>
                        <h4 style="font-size:13px;">
                            #${index + 1} ${escapeHtml(item.testName)}
                        </h4>
                        <p style="font-size:10px;color:#64748b;margin-top:4px;">
                            ${escapeHtml(item.completedAt)}
                        </p>
                    </div>

                    <strong style="color:#4f46e5;font-size:16px;">
                        ${escapeHtml(item.percentage)}%
                    </strong>
                </div>

                <div style="
                    display:grid;grid-template-columns:repeat(3,1fr);
                    gap:6px;margin-top:10px;text-align:center;
                ">
                    <div style="background:#eef2ff;padding:7px;border-radius:7px;">
                        <small>Score</small><br>
                        <b>${escapeHtml(item.score)} / ${escapeHtml(item.maxMarks)}</b>
                    </div>
                    <div style="background:#f0fdf4;padding:7px;border-radius:7px;">
                        <small>Attempted</small><br>
                        <b>${escapeHtml(item.attempted)} / ${escapeHtml(item.total)}</b>
                    </div>
                    <div style="background:#fff7ed;padding:7px;border-radius:7px;">
                        <small>Attempt</small><br>
                        <b>${rankings.length - index}</b>
                    </div>
                </div>

                <button
                    id="ranking-question-btn-${index}"
                    onclick="window.toggleRankingQuestions(${index})"
                    style="
                        width:100%;margin-top:10px;padding:8px;border:none;
                        border-radius:7px;background:#4f46e5;color:#fff;
                        font-size:12px;font-weight:700;
                    ">
                    Questions देखें
                </button>

                <div id="ranking-questions-${index}"
                     style="display:none;margin-top:5px;">
                    ${
                        Array.isArray(item.questions) && item.questions.length
                            ? `
                                <button
                                    onclick="window.openRankingSolutionViewer(${index})"
                                    style="
                                        width:100%;padding:10px;border:none;
                                        border-radius:8px;background:#2563eb;
                                        color:#fff;font-size:12px;font-weight:700;
                                    ">
                                    View Questions & Solutions एक-एक करके
                                </button>
                            `
                            : `
                                <div style="padding:10px;color:#64748b;font-size:12px;">
                                    इस attempt में प्रश्न सेव नहीं हैं।
                                </div>
                            `
                    }
                </div>

                <button
                    onclick="window.deleteRankingAttempt(${index})"
                    style="
                        width:100%;margin-top:8px;padding:8px;
                        border:1px solid #fecaca;border-radius:7px;
                        background:#fef2f2;color:#dc2626;
                        font-size:12px;font-weight:700;
                    ">
                    🗑 यह Attempt Delete करें
                </button>
            </div>
        `).join("");
    }

    function openRankings() {
        renderRankings();
        showScreen("screen-ranking");

        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.remove("active");
        });

        [...document.querySelectorAll(".nav-item")]
            .find(item => item.innerText.includes("Rankings"))
            ?.classList.add("active");
    }

    function setupRealtimePaletteScroll() {
        ["examJumpContainer", "solutionJumpContainer"].forEach(id => {
            const container = document.getElementById(id);
            if (!container) return;

            const scrollActive = () => {
                const active = container.querySelector(".strip-btn.active");
                active?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                });
            };

            new MutationObserver(() => {
                requestAnimationFrame(scrollActive);
            }).observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class"]
            });

            container.addEventListener("click", event => {
                event.target.closest(".strip-btn")?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                });
            });
        });
    }

    window.toggleRankingQuestions = toggleQuestions;
    window.deleteRankingAttempt = deleteRankingAttempt;

    window.openRankingSolutionViewer = function (index) {
        const rankings = getRankings().slice().reverse();
        const item = rankings[index];

        if (item) {
            openSolutionViewer(item.questions, item.testName);
        }
    };

    window.openRankingQuestion = function (index) {
        if (index >= 0 && index < viewerQuestions.length) {
            viewerIndex = index;
            renderViewerQuestion();
        }
    };

    window.openRankings = openRankings;

    // startTest के लिए नया session बनाएं
    const originalStartTest = window.startTest;

    function installStartTestHook() {
        if (typeof window.startTest !== "function") return;

        if (!window.startTest.__rankingWrapped) {
            const start = window.startTest;

            window.startTest = function (...args) {
                window.__vidyaTestSessionId = Date.now();
                lastSavedTest = null;
                return start.apply(this, args);
            };

            window.startTest.__rankingWrapped = true;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => {
            const rankingButton = [...document.querySelectorAll(".nav-item")]
                .find(item => item.innerText.includes("Rankings"));

            if (rankingButton) {
                rankingButton.onclick = openRankings;
            }

            installStartTestHook();
            installResultHook();
            setupRealtimePaletteScroll();

            // index.html के functions script load होने के बाद उपलब्ध हों
            const hookTimer = setInterval(() => {
                installStartTestHook();
                installResultHook();

                if (resultHookInstalled) {
                    clearInterval(hookTimer);
                }
            }, 300);
        }, 100);
    });
})();