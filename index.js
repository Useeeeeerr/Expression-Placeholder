import { getContext, extension_settings, eventSource } from "../../../script.js";
import { executeSlashCommands } from "../../slash-commands.js";

// 확장 이름 정의
const extensionName = "expression_placeholder";

// 기본 설정
const defaultSettings = {
    enabled: true,
    placeholderFormat: "{{expression}}",
    customPlaceholderFormat: "{{expression:NAME}}"
};

// 현재 설정 초기화
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}

// 기본 설정 적용
Object.assign(extension_settings[extensionName], defaultSettings);

// 현재 표시되는 감정 이름 추적
let currentExpressionName = 'neutral';

// 감정 placeholder 패턴 정규식
const expressionPlaceholderRegex = /\{\{expression(?::(.*?))?\}\}/g;

/**
 * 현재 감정 표현 업데이트 함수
 */
function updateCurrentExpression(expressionName) {
    if (!expressionName) return;
    
    currentExpressionName = expressionName;
    console.debug(`[${extensionName}] Current expression updated to: ${expressionName}`);
    
    // 필요하면 이벤트 발생 가능
    eventSource.dispatchEvent(new CustomEvent(`${extensionName}_updated`, { 
        detail: { expression: expressionName } 
    }));
}

/**
 * 메시지에서 표현식 placeholder 처리
 */
function processExpressionPlaceholders(message) {
    if (typeof message !== 'string') return message;
    if (!extension_settings[extensionName].enabled) return message;
    
    return message.replace(expressionPlaceholderRegex, (match, expressionName) => {
        // 지정된 표현식이 있으면 사용, 없으면 현재 표현식 사용
        const exprName = expressionName || currentExpressionName;
        return exprName; // 텍스트로 치환
    });
}

/**
 * 다른 확장과의 호환성을 위한 메시지 렌더링 처리
 */
function processMessageForDisplay(messageText) {
    if (typeof messageText !== 'string') return messageText;
    if (!extension_settings[extensionName].enabled) return messageText;
    
    return messageText.replace(expressionPlaceholderRegex, (match, expressionName) => {
        const exprName = expressionName || currentExpressionName;
        return `<span class="expression-reference" data-expression="${exprName}">${exprName}</span>`;
    });
}

/**
 * 확장 UI 설정 생성
 */
function createUI() {
    const settingsHtml = `
    <div id="${extensionName}_settings" class="extension_settings">
        <h3>Expression Placeholder 설정</h3>
        <label class="checkbox_label">
            <input type="checkbox" id="${extensionName}_enabled" ${extension_settings[extensionName].enabled ? 'checked' : ''}>
            <span>활성화</span>
        </label>
        <br>
        <label>사용법:</label>
        <div class="explanation_text">
            <p>메시지에 <code>{{expression}}</code>을 입력하면 현재 표시되는 감정으로 대체됩니다.</p>
            <p>특정 감정을 직접 지정하려면 <code>{{expression:happy}}</code>와 같이 입력하세요.</p>
        </div>
    </div>`;

    $('#extensions_settings').append(settingsHtml);
    
    // 이벤트 리스너 추가
    $(`#${extensionName}_enabled`).on('change', function() {
        extension_settings[extensionName].enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
}

/**
 * 확장 이벤트 핸들러 설정
 */
function setupEventListeners() {
    // 감정표현 확장의 이벤트 수신
    eventSource.addEventListener('expression_changed', (event) => {
        if (event.detail && event.detail.expression) {
            updateCurrentExpression(event.detail.expression);
        }
    });
    
    // 기존 이벤트가 없는 경우를 위한 폴백 방법 - 필요에 따라 수정
    $(document).on('expressionChange', (event, data) => {
        if (data && data.expressionName) {
            updateCurrentExpression(data.expressionName);
        }
    });
}

/**
 * 확장 진입점
 */
jQuery(async () => {
    // UI 생성
    createUI();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 상호작용 이벤트 설정
    const expressionExtension = window['expressions'];
    if (expressionExtension && expressionExtension.setExpression) {
        // 원본 함수 참조 저장
        const originalSetExpression = expressionExtension.setExpression;
        
        // 함수 오버라이드
        expressionExtension.setExpression = function(character, expression, force) {
            // 원본 함수 호출
            const result = originalSetExpression.call(this, character, expression, force);
            
            // 현재 표현식 업데이트
            updateCurrentExpression(expression);
            
            return result;
        };
    }
});

// 확장 기능 내보내기
export const expressionPlaceholder = {
    processExpressionPlaceholders,
    processMessageForDisplay,
    getCurrentExpression: () => currentExpressionName
};

// SillyTavern 확장 시스템에 기능 등록
const extension_functions = {
    // 메시지 전송 전 처리
    beforeSendMessage: (messageText) => {
        return processExpressionPlaceholders(messageText);
    },
    
    // 메시지 렌더링 시 처리
    afterMessageRendering: (messageElement, messageText) => {
        if (!extension_settings[extensionName].enabled) return;
        
        // 표현식 참조 요소에 클릭 이벤트 추가 (선택 사항)
        $(messageElement).find('.expression-reference').on('click', function() {
            const expression = $(this).data('expression');
            if (expression && window['expressions'] && window['expressions'].setExpression) {
                // 클릭한 표현식으로 설정
                window['expressions'].setExpression('current', expression, true);
            }
        });
    },
    
    // 슬래시 명령어 추가 (옵션)
    slashCommands: [
        {
            name: 'expression',
            help: '현재 감정 표현 설정 (예: /expression happy)',
            handler: (args) => {
                if (!args.length) return "표현할 감정을 지정해주세요";
                
                const expression = args[0].trim();
                if (window['expressions'] && window['expressions'].setExpression) {
                    window['expressions'].setExpression('current', expression, true);
                    return `감정 표현이 '${expression}'으로 설정되었습니다`;
                }
                
                return "감정 표현 확장이 활성화되어 있지 않습니다";
            }
        }
    ]
};
