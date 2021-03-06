import { swizzle } from "@thi.ng/arrays";
import { permutations, permutationsN } from "../src/iter/permutations";
import { range } from "../src/iter/range";
import { iterator } from "../src/iterator";
import { map } from "../src/xform/map";

import * as assert from "assert";

describe("permutations", () => {
    it("empty", () => {
        assert.deepEqual([...permutations([])], []);
        assert.deepEqual([...permutations("")], []);
        assert.deepEqual([...permutations(range(0))], []);
        assert.deepEqual([...permutations([], [])], []);
        assert.deepEqual([...permutations([], "")], []);
        assert.deepEqual([...permutations(range(0), "")], []);
        assert.deepEqual([...permutations([], "a")], []);
        assert.deepEqual([...permutations("", "a")], []);
        assert.deepEqual([...permutations("", "ab")], []);
        assert.deepEqual([...permutations.apply(null, [])], []);
    });
    it("single", () => {
        assert.deepEqual(
            [...permutations("a", "-", range(1))],
            [["a", "-", 0]]
        );
        assert.deepEqual(
            [...permutations("a", "-", range(2))],
            [["a", "-", 0], ["a", "-", 1]]
        );
        assert.deepEqual(
            [...permutations("a", "-+", range(2))],
            [["a", "-", 0], ["a", "-", 1], ["a", "+", 0], ["a", "+", 1]]
        );
    });
    it("transformed", () => {
        assert.deepEqual(
            [...iterator(map((x: any[]) => x.join("")), permutations("ab", "-", range(2)))],
            ['a-0', 'a-1', 'b-0', 'b-1']
        );
    });
    it("swizzle", () => {
        assert.deepEqual(
            [...iterator(map((x: string[]) => swizzle(x)({ x: 0, y: 1, z: 2 })), permutations("xyz", "xyz", "xyz"))],
            [...permutationsN(3)]
        );
    });
});

describe("permutationsN", () => {
    it("empty", () => {
        assert.deepEqual([...permutationsN(0)], []);
    });
    it("one", () => {
        assert.deepEqual([...permutationsN(1)], [[0]]);
    });
    it("two", () => {
        assert.deepEqual([...permutationsN(2)], [[0, 0], [0, 1], [1, 0], [1, 1]]);
    });
    it("two/three", () => {
        assert.deepEqual(
            [...permutationsN(2, 3)],
            [
                [0, 0], [0, 1], [0, 2],
                [1, 0], [1, 1], [1, 2],
                [2, 0], [2, 1], [2, 2]
            ]
        );
    });
    it("with offsets", () => {
        assert.deepEqual([...permutationsN(2, 2, [100, 1000])], [[100, 1000], [100, 1001], [101, 1000], [101, 1001]]);
    });
    it("insufficient offsets", () => {
        assert.throws(() => permutationsN(2, 2, [0]));
    });
});