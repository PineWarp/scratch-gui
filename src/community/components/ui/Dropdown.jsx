import classNames from 'classnames';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import styles from './Dropdown.module.css';

// 翻转判定时离视口边缘保留的余量
const FLIP_MARGIN = 8;
// 菜单与触发器之间的间距，与 Dropdown.module.css 里的 calc(100% + 7px) 保持一致
const MENU_GAP = 7;
// 退场动画时长，与 bl-menu-animation.css 里的 bl-dropdown-exit-* 保持一致；留一点余量再卸载
const EXIT_MS = 130;

// 菜单是相对触发器绝对定位的，会被最近的 overflow 祖先裁掉；
// 找最近的裁剪祖先，没有就退回视口
const clipBounds = node => {
    let el = node && node.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
            const rect = el.getBoundingClientRect();
            return {top: rect.top, bottom: rect.bottom};
        }
        el = el.parentElement;
    }
    return {top: 0, bottom: window.innerHeight};
};

// 动画开关与右键菜单/窗口同一套：gui.jsx 按设置里的「开启窗口动画」
// 给 <html> 增删 no-window-animation 类，实时读取即可跟随设置变化
const animationsEnabled = () => !(
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('no-window-animation')
);

const Dropdown = ({renderTrigger, children, align = 'right', width, className, menuClassName}) => {
    // phase: 'open' 展开中 / 'closing' 退场动画中 / 'closed' 已卸载
    const [phase, setPhase] = useState('closed');
    const [flipped, setFlipped] = useState(false);
    const wrapRef = useRef(null);
    const menuRef = useRef(null);
    const exitTimer = useRef(null);
    // phaseRef 让 close/toggle 闭包里总能读到最新状态
    const phaseRef = useRef(phase);
    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

    const close = useCallback(() => {
        if (phaseRef.current !== 'open') return;
        if (!animationsEnabled()) {
            setPhase('closed');
            return;
        }
        clearTimeout(exitTimer.current);
        exitTimer.current = setTimeout(() => setPhase('closed'), EXIT_MS);
        setPhase('closing');
    }, []);

    const toggle = useCallback(() => {
        clearTimeout(exitTimer.current);
        if (phaseRef.current === 'open') {
            close();
            return;
        }
        // 退场途中再点触发器：取消退场，直接重新展开
        setPhase('open');
    }, [close]);

    useEffect(() => () => clearTimeout(exitTimer.current), []);

    useEffect(() => {
        const onDown = event => {
            const inWrap = wrapRef.current && wrapRef.current.contains(event.target);
            const inMenu = menuRef.current && menuRef.current.contains(event.target);
            if (!inWrap && !inMenu) {
                close();
            }
        };
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, [close]);

    useEffect(() => {
        if (phase === 'closed') return;
        const onKeyDown = event => {
            if (event.key === 'Escape') {
                // 不要让 Esc 继续冒泡去关掉外层弹窗
                event.stopPropagation();
                close();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [phase, close]);

    // 默认向下展开；下方空间不够时翻到触发器上方，避免被滚动/裁剪容器切掉
    useLayoutEffect(() => {
        if (phase !== 'open') return;
        const menu = menuRef.current;
        const wrap = wrapRef.current;
        if (!menu || !wrap) return;
        // 用 offsetHeight 而不是 getBoundingClientRect：入场/退场动画的 scale 会被算进
        // rect，会让翻转判定偏小、贴着边缘时判断错。这里按"未翻转时菜单底部落在哪"来推。
        const menuHeight = menu.offsetHeight || menu.getBoundingClientRect().height;
        const wrapRect = wrap.getBoundingClientRect();
        const bounds = clipBounds(wrap);
        const bottomIfOpenDown = wrapRect.bottom + MENU_GAP + menuHeight;
        const noRoomBelow = bottomIfOpenDown > bounds.bottom - FLIP_MARGIN;
        const roomAbove = wrapRect.top - FLIP_MARGIN > menuHeight;
        setFlipped(noRoomBelow && roomAbove);
    }, [phase]);

    return (
        <div
            className={classNames(styles.wrap, className)}
            ref={wrapRef}
        >
            {renderTrigger({
                open: phase === 'open',
                toggle,
                close
            })}
            {phase !== 'closed' ? (
                <div
                    className={classNames(
                        align === 'left' ? styles.menuLeft : styles.menu,
                        {[styles.menuUp]: flipped},
                        menuClassName
                    )}
                    data-closing={phase === 'closing' ? 'true' : null}
                    data-flipped={flipped ? 'true' : null}
                    data-mw-dropdown
                    ref={menuRef}
                    style={width ? {width} : null}
                >
                    {typeof children === 'function' ? children({close}) : children}
                </div>
            ) : null}
        </div>
    );
};

const DropdownItem = ({danger = false, className = '', ...props}) => (
    <button
        type="button"
        className={`${styles.item}${danger ? ` ${styles.itemDanger}` : ''}${className ? ` ${className}` : ''}`}
        {...props}
    />
);

export {Dropdown, DropdownItem};
export default Dropdown;
