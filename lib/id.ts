/* eslint-disable @typescript-eslint/no-namespace */

export class ObjectId {
  private readonly value: string;

  constructor(value?: unknown) {
    this.value = value ? String(value) : "";
  }

  toString() {
    return this.value;
  }

  valueOf() {
    return this.value;
  }

  toJSON() {
    return this.value;
  }

  static isValid(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
  }
}

type ObjectIdValue = ObjectId;

export namespace Types {
  export type ObjectId = ObjectIdValue;
}

export const Types = {
  ObjectId,
};
