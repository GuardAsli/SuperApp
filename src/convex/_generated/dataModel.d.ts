/* eslint-disable */
export type Id<TableName extends string> = string & { __tableName: TableName };
export type Doc<TableName extends string> = Record<string, any> & { _id: Id<TableName> };
export type DataModel = any;
