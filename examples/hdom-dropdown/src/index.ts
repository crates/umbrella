import { Atom } from "@thi.ng/atom/atom";
import { start } from "@thi.ng/hdom/start";
import { EventBus } from "@thi.ng/interceptors/event-bus";
import { trace } from "@thi.ng/interceptors/interceptors";

import { state, theme } from "./config";
import { dropdown, dropdownListeners } from "./dropdown";

const bus = new EventBus(new Atom(state));
bus.instrumentWith([trace]);

const dd = dropdown("theme.dd");

start("app",
    (ctx) => {
        bus.processQueue();
        return ["div", ctx.theme.root,
            ["div", ctx.theme.column,
                [dd, {
                    ...dropdownListeners(ctx, ["foo"]),
                    state: ctx.bus.state.deref().foo,
                    hoverLabel: [["span", "Choose a genre..."], ["i.fr.fas.fa-angle-down"]]
                }]],
            ["div", ctx.theme.column,
                [dd, {
                    ...dropdownListeners(ctx, ["bar"]),
                    state: ctx.bus.state.deref().bar,
                    hoverLabel: [["span", "Region..."], ["i.fr.fas.fa-angle-down"]]
                }]],
        ];
    },
    { bus, theme });