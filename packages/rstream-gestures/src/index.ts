import { IID, Nullable } from "@thi.ng/api";
import { clamp } from "@thi.ng/math";
import { fromDOMEvent, merge, StreamMerge } from "@thi.ng/rstream";
import { map } from "@thi.ng/transducers";

export const enum GestureType {
    START,
    MOVE,
    DRAG,
    END,
    ZOOM
}

/**
 * Reverse lookup for {@link GestureType} enums
 */
// export const __GestureType = (<any>exports).GestureType;

export interface GestureInfo {
    pos: number[];
    click?: number[];
    delta?: number[];
    zoom: number;
    zoomDelta: number;
    buttons: number;
}

export interface GestureEvent {
    [0]: GestureType;
    [1]: GestureInfo;
}

type UIEvent = MouseEvent | TouchEvent | WheelEvent;

export interface GestureStreamOpts extends IID<string> {
    /**
     * Event listener options (see standard `addEventListener`).
     * Default: false
     */
    eventOpts: boolean | AddEventListenerOptions;
    /**
     * If `true`, calls `preventDefault()` for each event.
     * Default: true
     */
    preventDefault: boolean;
    /**
     * Initial zoom value. Default: 1
     */
    zoom: number;
    /**
     * If true, the produced `zoom` values are considered absolute and
     * will be constrained to the `minZoom .. maxZoom` interval. If
     * `false`, the zoom values are relative and simply the result of
     * `event.deltaY * smooth`.
     *
     * Default: true
     */
    absZoom: boolean;
    /**
     * Min zoom value. Default: 0.25
     */
    minZoom: number;
    /**
     * Max zoom value. Default: 4
     */
    maxZoom: number;
    /**
     * Scaling factor for zoom changes. Default: 1
     */
    smooth: number;
    /**
     * Local coordinate flag. If true (default), the elements position
     * offset is subtracted.
     */
    local: boolean;
    /**
     * If true, all positions and delta values are scaled by
     * `window.devicePixelRatio`. Note: Only enable if `local` is true.
     *
     * @defaultValue false
     */
    scale: boolean;
}

/**
 * By using "<const>" we make typescript constain the type of this
 * from string[] to an tuple containing exactly those values
 */
const events = <const>[
    "mousedown",
    "mousemove",
    "mouseup",
    "touchstart",
    "touchmove",
    "touchend",
    "touchcancel",
    "wheel"
];

const touchEventMap: Record<string, GestureType> = {
    touchstart: GestureType.START,
    touchmove: GestureType.DRAG,
    touchend: GestureType.END,
    touchcancel: GestureType.END
};

/**
 * Attaches mouse & touch event listeners to given DOM element and
 * returns a stream of custom "gesture" events in the form of tuples:
 *
 * ```
 * [type, {pos, click?, delta?, zoom, zoomDelta?, buttons}]
 * ```
 *
 * The `click` and `delta` values are only present if `type ==
 * GestureType.DRAG`. Both (and `pos` too) are 2-element arrays of
 * `[x,y]` coordinates.
 *
 * The `zoom` value is always present, but is only updated with wheel
 * events. The value will be constrained to `minZoom` ... `maxZoom`
 * interval (provided via options object).
 *
 * Note: If using `preventDefault` and attaching the event stream to
 * `document.body`, the following event listener options SHOULD be used:
 *
 * @example
 * ```ts
 * eventOpts: { passive: false }
 * ```
 *
 * {@link https://www.chromestatus.com/features/5093566007214080 }
 *
 * @param el -
 * @param opts -
 */
export const gestureStream = (
    el: HTMLElement,
    _opts?: Partial<GestureStreamOpts>
): StreamMerge<any, GestureEvent> => {
    let isDown = false;
    let clickPos: Nullable<number[]> = null;

    const opts = <GestureStreamOpts>{
        id: "gestures",
        zoom: 1,
        absZoom: true,
        minZoom: 0.25,
        maxZoom: 4,
        smooth: 1,
        eventOpts: { capture: true },
        preventDefault: true,
        local: true,
        scale: false,
        ..._opts
    };

    let zoom = clamp(opts.zoom, opts.minZoom, opts.maxZoom);
    const dpr = window.devicePixelRatio || 1;

    return merge<UIEvent, GestureEvent>({
        id: opts.id,
        src: events.map((e) => fromDOMEvent(el, e, opts.eventOpts)),
        xform: map((e) => {
            let evt: Touch | MouseEvent;
            let type: GestureType;
            let buttons: number;
            opts.preventDefault && e.preventDefault();
            if ((<TouchEvent>e).touches) {
                evt = (<TouchEvent>e).changedTouches[0];
                buttons = ~~(e.type == "touchstart" || e.type != "touchmove");
                type = touchEventMap[e.type];
            } else {
                evt = <MouseEvent>e;
                buttons = evt.buttons;
                isDown = buttons > 0;
                type = (<Record<string, GestureType>>{
                    mousedown: GestureType.START,
                    mousemove: isDown ? GestureType.DRAG : GestureType.MOVE,
                    mouseup: GestureType.END,
                    wheel: GestureType.ZOOM
                })[e.type];
            }
            const pos = [evt.clientX | 0, evt.clientY | 0];
            if (opts.local) {
                const rect = el.getBoundingClientRect();
                pos[0] -= rect.left;
                pos[1] -= rect.top;
            }
            if (opts.scale) {
                pos[0] *= dpr;
                pos[1] *= dpr;
            }
            const body = <GestureInfo>{ pos, zoom, zoomDelta: 0, buttons };
            switch (type) {
                case GestureType.START:
                    isDown = true;
                    clickPos = [...pos];
                    break;
                case GestureType.END:
                    isDown = false;
                    clickPos = null;
                    break;
                case GestureType.DRAG:
                    body.click = clickPos!;
                    body.delta = [pos[0] - clickPos![0], pos[1] - clickPos![1]];
                    break;
                case GestureType.ZOOM:
                    const zdelta =
                        opts.smooth *
                        ("wheelDeltaY" in (e as any)
                            ? -(e as any).wheelDeltaY / 120
                            : (<WheelEvent>e).deltaY / 40);
                    body.zoom = zoom = opts.absZoom
                        ? clamp(zoom + zdelta, opts.minZoom, opts.maxZoom)
                        : zdelta;
                    body.zoomDelta = zdelta;
                    break;
                default:
            }
            return <GestureEvent>[type, body];
        })
    });
};
