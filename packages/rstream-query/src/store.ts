import { IObjectOf } from "@thi.ng/api/api";
import { equiv } from "@thi.ng/api/equiv";
import { illegalArgs } from "@thi.ng/api/error";
import { intersection } from "@thi.ng/associative/intersection";
import { join } from "@thi.ng/associative";
import { Stream, Subscription, sync } from "@thi.ng/rstream";
import { toDot, walk, DotOpts, IToDot } from "@thi.ng/rstream-dot";
import { Transducer, Reducer } from "@thi.ng/transducers/api";
import { comp } from "@thi.ng/transducers/func/comp";
import { compR } from "@thi.ng/transducers/func/compr";
import { filter } from "@thi.ng/transducers/xform/filter";
import { map } from "@thi.ng/transducers/xform/map";

import { DEBUG, Edit, Triple, TripleIds, Pattern, Solutions, Triples } from "./api";
import { qvarResolver } from "./pattern";
import { isQVar } from "./qvar";

export class TripleStore implements
    IToDot {

    static NEXT_ID = 0;

    triples: Triple[];
    indexS: Map<any, TripleIds>;
    indexP: Map<any, TripleIds>;
    indexO: Map<any, TripleIds>;
    indexSelections: IObjectOf<Map<any, Subscription<Edit, TripleIds>>>;
    allSelections: IObjectOf<Subscription<TripleIds, TripleIds>>;
    allIDs: TripleIds;

    streamAll: Stream<TripleIds>;
    streamS: Stream<Edit>;
    streamP: Stream<Edit>;
    streamO: Stream<Edit>;

    constructor(triples?: Iterable<Triple>) {
        this.triples = [];
        this.indexS = new Map();
        this.indexP = new Map();
        this.indexO = new Map();
        this.indexSelections = {
            "s": new Map(),
            "p": new Map(),
            "o": new Map()
        };
        this.streamS = new Stream("S");
        this.streamP = new Stream("P");
        this.streamO = new Stream("O");
        this.streamAll = new Stream("ALL");
        this.allIDs = new Set<number>();
        this.allSelections = {
            "s": this.streamAll.subscribe(null, "s"),
            "p": this.streamAll.subscribe(null, "p"),
            "o": this.streamAll.subscribe(null, "o")
        };
        if (triples) {
            this.addTriples(triples);
        }
    }

    has(f: Triple) {
        return this.findInIndices(
            this.indexS.get(f[0]),
            this.indexP.get(f[1]),
            this.indexO.get(f[2]),
            f
        ) !== -1;
    }

    addTriple(t: Triple) {
        let s = this.indexS.get(t[0]);
        let p = this.indexP.get(t[1]);
        let o = this.indexO.get(t[2]);
        if (this.findInIndices(s, p, o, t) !== -1) return false;
        const id = TripleStore.NEXT_ID++;
        const is = s || new Set<number>();
        const ip = p || new Set<number>();
        const io = o || new Set<number>();
        this.triples[id] = t;
        is.add(id);
        ip.add(id);
        io.add(id);
        this.allIDs.add(id);
        !s && this.indexS.set(t[0], is);
        !p && this.indexP.set(t[1], ip);
        !o && this.indexO.set(t[2], io);
        this.streamAll.next(this.allIDs);
        this.streamS.next({ index: is, key: t[0] });
        this.streamP.next({ index: ip, key: t[1] });
        this.streamO.next({ index: io, key: t[2] });
        return true;
    }

    addTriples(triples: Iterable<Triple>) {
        let ok = true;
        for (let f of triples) {
            ok = this.addTriple(f) && ok;
        }
        return ok;
    }

    /**
     * Creates a new query subscription from given SPO pattern. Any
     * `null` values in the pattern act as wildcard selectors and any
     * other value as filter for the given triple component. E.g. the
     * pattern `[null, "type", "person"]` matches all triples which have
     * `"type"` as predicate and `"person"` as object. Likewise the
     * pattern `[null, null, null]` matches ALL triples in the graph.
     *
     * By default, the returned rstream subscription emits sets of
     * matched triples. If only the raw triple IDs are wanted, set
     * `emitTriples` arg to `false`.
     *
     * @param id
     * @param param1
     */
    addPatternQuery(id: string, [s, p, o]: Pattern, emitTriples = true): Subscription<TripleIds, TripleIds | Triples> {
        let results: Subscription<any, TripleIds | Triples>;
        if (s == null && p == null && o == null) {
            results = this.streamAll;
        } else {
            const qs = this.getIndexSelection(this.streamS, s, "s");
            const qp = this.getIndexSelection(this.streamP, p, "p");
            const qo = this.getIndexSelection(this.streamO, o, "o");
            results = sync<TripleIds, TripleIds>({
                id,
                src: [qs, qp, qo],
                xform: map(({ s, p, o }) => intersection(intersection(s, p), o)),
                reset: true,
            });
            const submit = (index: Map<any, Set<number>>, stream: Subscription<any, Set<number>>, key: any) => {
                if (key != null) {
                    const ids = index.get(key);
                    ids && stream.next({ index: ids, key });
                }
            };
            submit(this.indexS, qs, s);
            submit(this.indexP, qp, p);
            submit(this.indexO, qo, o);
        }
        return emitTriples ?
            results.transform(asTriples(this)) :
            results;
    }

    /**
     * Creates a new parametric query using given pattern with at least
     * 1 query variable. Query vars are strings with `?` prefix. The
     * rest of the string is considered the variable name.
     *
     * ```
     * g.addParamQuery("id", ["?a", "friend", "?b"]);
     * ```
     *
     * Internally, the query pattern is translated into a basic param
     * query with an additional result transformation to resolve the
     * stated query variable solutions. Returns a rstream subscription
     * emitting arrays of solution objects like:
     *
     * ```
     * [{a: "asterix", b: "obelix"}, {a: "romeo", b: "julia"}]
     * ```
     *
     * @param id
     * @param param1
     */
    addParamQuery(id: string, [s, p, o]: Pattern): Subscription<Triples, Solutions> {
        const vs = isQVar(s);
        const vp = isQVar(p);
        const vo = isQVar(o);
        const resolve = qvarResolver(vs, vp, vo, s, p, o);
        if (!resolve) {
            illegalArgs("at least 1 query variable is required in pattern");
        }
        const query = <Subscription<any, Set<Triple>>>this.addPatternQuery(
            id + "-raw",
            [vs ? null : s, vp ? null : p, vo ? null : o],
        );
        return query.transform(
            map((triples: Set<Triple>) => {
                const res = new Set<any>();
                for (let f of triples) {
                    res.add(resolve(f));
                }
                return res;
            }),
            id
        );
    }

    /**
     * Returns a rstream subscription computing the natural join of the
     * given input query results. The subscription only produces results
     * if there's at least 1 joined result.
     *
     * @param id
     * @param a
     * @param b
     */
    addQueryJoin(id: string, a: Subscription<any, Solutions>, b: Subscription<any, Solutions>): Subscription<Solutions, Solutions> {
        return sync<Solutions, Solutions>({
            id,
            src: { a, b },
            xform: comp(map(({ a, b }) => join(a, b)), filter((x) => x.size > 0))
        });
    }

    toDot(opts?: Partial<DotOpts>) {
        return toDot(walk([this.streamS, this.streamP, this.streamO, this.streamAll]), opts);
    }

    protected findInIndices(s: TripleIds, p: TripleIds, o: TripleIds, f: Triple) {
        if (s && p && o) {
            const triples = this.triples;
            const index = s.size < p.size ?
                s.size < o.size ? s : p.size < o.size ? p : o :
                p.size < o.size ? p : s.size < o.size ? s : o;
            for (let id of index) {
                if (equiv(triples[id], f)) {
                    return id;
                }
            }
        }
        return -1;
    }

    protected getIndexSelection(stream: Stream<Edit>, key: any, id: string): Subscription<any, TripleIds> {
        if (key != null) {
            let sel = this.indexSelections[id].get(key);
            if (!sel) {
                this.indexSelections[id].set(key, sel = stream.transform(indexSel(key), id));
            }
            return sel;
        }
        return this.allSelections[id];
    }
}

export const indexSel = (key: any): Transducer<Edit, TripleIds> =>
    (rfn: Reducer<any, TripleIds>) => {
        const r = rfn[2];
        return compR(rfn,
            (acc, e) => {
                DEBUG && console.log("index sel", e.key, key);
                if (equiv(e.key, key)) {
                    return r(acc, e.index);
                }
                return acc;
            }
        );
    };

export const asTriples = (graph: TripleStore) =>
    map<TripleIds, Set<Triple>>(
        (ids) => {
            const res = new Set<Triple>();
            for (let id of ids) res.add(graph.triples[id]);
            return res;
        });
