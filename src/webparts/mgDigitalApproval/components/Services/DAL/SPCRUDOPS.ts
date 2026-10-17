import { SPFI, SPFx, spfi } from "@pnp/sp";
import { IMgDigitalApprovalProps } from "../../IMgDigitalApprovalProps";

// PnPjs v4 selective imports.
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/lists/web";
import "@pnp/sp/items";
import "@pnp/sp/folders/web";
import "@pnp/sp/folders/list";
import "@pnp/sp/files/web";
import "@pnp/sp/files/folder";
import "@pnp/sp/attachments";
import "@pnp/sp/profiles";
import "@pnp/sp/site-users/web";
import "@pnp/sp/site-groups/web";
import "@pnp/sp/sites";
import "@pnp/sp/batching";

/**
 * Sort configuration used by list queries.
 */
export interface ISPOrderBy {
  column: string;
  isAscending: boolean;
}

export interface ISPPagedResult<T = any> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  hasNextPage: boolean;
}

/**
 * Generic SharePoint CRUD/data-access contract.
 *
 * The public method names intentionally remain compatible with the old
 * service so existing consumers can migrate to PnPjs 4.21.0 with minimal
 * changes.
 */
export interface ISPCRUDOPS {
  getData(listName: string, columnsToRetrieve: string, columnsToExpand: string, filters: string, orderby: ISPOrderBy, props: IMgDigitalApprovalProps): Promise<any[]>;
  /** Retrieves one logical page without loading the whole list into memory. */
  getDataPage(listName: string, columnsToRetrieve: string, columnsToExpand: string, filters: string, orderby: ISPOrderBy, pageNumber: number, pageSize: number, props: IMgDigitalApprovalProps): Promise<ISPPagedResult>;
  getRootData(listName: string, columnsToRetrieve: string, columnsToExpand: string, filters: string, orderby: ISPOrderBy, props: IMgDigitalApprovalProps): Promise<any[]>;
  insertData(listName: string, data: any, props: IMgDigitalApprovalProps): Promise<any>;
  updateData(listName: string, itemId: number, data: any, props: IMgDigitalApprovalProps): Promise<any>;
  /** Recycles the item into SharePoint's recycle bin. */
  deleteData(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<any>;
  /** Permanently deletes the item. Use only when that behavior is intended. */
  deleteDataPermanent(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<any>;
  getListInfo(listName: string, props: IMgDigitalApprovalProps): Promise<any>;
  /** Returns SharePoint's normal result page, not an all-items operation. */
  getListData(listName: string, columnsToRetrieve: string, props: IMgDigitalApprovalProps): Promise<any[]>;
  batchInsert(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]>;
  batchUpdate(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]>;
  /** Batch recycle - kept consistent with deleteData. */
  batchDelete(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]>;
  /** Batch permanent delete - explicit destructive operation. */
  batchDeletePermanent(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]>;
  createFolder(listName: string, folderName: string, props: IMgDigitalApprovalProps): Promise<any>;
  uploadFile(folderServerRelativeUrl: string, file: File, props: IMgDigitalApprovalProps): Promise<any>;
  deleteFile(fileServerRelativeUrl: string, props: IMgDigitalApprovalProps): Promise<any>;
  currentProfile(props: IMgDigitalApprovalProps): Promise<any | null>;
  getLoggedInSiteGroups(props: IMgDigitalApprovalProps): Promise<any[]>;
  getAllSiteGroups(props: IMgDigitalApprovalProps): Promise<any[]>;
  /** Resolves a login name / claim to a site user (adds the user to the site if needed). */
  ensureUser(loginName: string, props: IMgDigitalApprovalProps): Promise<any>;
  getTopData(listName: string, columnsToRetrieve: string, columnsToExpand: string, filters: string, orderby: ISPOrderBy, top: number, props: IMgDigitalApprovalProps): Promise<any[]>;
  /** Preserves the original misspelled public method for compatibility. */
  addAttchmentInList(data: File, listName: string, itemId: number, fileName: string, props: IMgDigitalApprovalProps): Promise<any>;
  /** Correctly-spelled alias for new code. */
  addAttachmentInList(data: File, listName: string, itemId: number, fileName: string, props: IMgDigitalApprovalProps): Promise<any>;
}

/**
 * Uploads larger than this threshold use SharePoint's chunked upload API.
 * PnPjs documentation uses 10 MB as a practical starting point.
 */
const CHUNKED_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

/**
 * SharePoint/PnPjs async paging supports chunks up to 5000 items. Keeping this
 * at 5000 reduces round trips while still respecting the documented paging size.
 */
const DEFAULT_PAGE_SIZE = 5000;
const DEFAULT_UI_PAGE_SIZE = 100;

/**
 * Keep batch execution deterministic. SharePoint REST batches are limited to
 * 100 requests per batch; PnPjs can split batches too, but explicit chunking
 * makes this service predictable and easier to troubleshoot.
 */
const BATCH_CHUNK_SIZE = 100;

class SPCRUDOPSImpl implements ISPCRUDOPS {
  /** Cached SPFI instance for the current SPFx context. */
  private _sp: SPFI | undefined;
  private _context: any;

  /**
   * Returns a configured PnPjs v4 SPFI instance for the current SPFx context.
   * The instance is recreated automatically if a different context is passed.
   */
  private getSP(props: IMgDigitalApprovalProps): SPFI {
    const context = props?.currentSPContext;

    if (!context?.pageContext?.web?.absoluteUrl) {
      throw new Error("SharePoint context is not available.");
    }

    if (!this._sp || this._context !== context) {
      this._sp = spfi().using(SPFx(context));
      this._context = context;
    }

    return this._sp;
  }

  /** Validates a SharePoint list name before sending a request. */
  private validateListName(listName: string): void {
    if (typeof listName !== "string" || !listName.trim()) {
      throw new Error("A valid SharePoint list name is required.");
    }
  }

  /** Validates a SharePoint list item id. */
  private validateItemId(itemId: number): void {
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new Error(`A valid SharePoint item ID is required. Received: ${itemId}`);
    }
  }

  /** Validates object payloads for add/update operations. */
  private validatePayload(data: any, operation: string): void {
    if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${operation} requires a SharePoint field-value object.`);
    }
  }

  /** Validates a batch payload. Empty arrays are valid and return no-op results. */
  private validateBatch(data: any[], operation: string): void {
    if (!Array.isArray(data)) {
      throw new Error(`${operation} requires an array.`);
    }
  }

  /** Splits comma-separated select/expand strings while tolerating whitespace. */
  private parseFields(value?: string): string[] {
    if (!value || typeof value !== "string") {
      return [];
    }

    return value
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  /** Applies the old service's select/expand/filter/orderBy semantics to a v4 query. */
  private applyQueryOptions(
    items: any,
    columnsToRetrieve: string,
    columnsToExpand: string,
    filters: string,
    orderby: ISPOrderBy
  ): any {
    const selectFields = this.parseFields(columnsToRetrieve);
    const expandFields = this.parseFields(columnsToExpand);

    if (selectFields.length) {
      items = items.select(...selectFields);
    }

    if (expandFields.length) {
      items = items.expand(...expandFields);
    }

    if (typeof filters === "string" && filters.trim()) {
      items = items.filter(filters.trim());
    }

    if (orderby?.column?.trim()) {
      items = items.orderBy(orderby.column.trim(), Boolean(orderby.isAscending));
    }

    return items;
  }

  /**
   * Reads all pages using PnPjs v4's async iterator instead of the removed
   * v2-style getAll() pattern.
   */
  private async getAllItems(itemsQuery: any, pageSize: number = DEFAULT_PAGE_SIZE): Promise<any[]> {
    const result: any[] = [];
    this.validatePageSize(pageSize, "pageSize");

    try {
      for await (const page of itemsQuery.top(pageSize)) {
        if (Array.isArray(page) && page.length) {
          result.push(...page);
        }
      }
    } catch (error) {
      // Re-throw so the centralized normalizer can turn threshold errors
      // into an actionable message without hiding the original error.
      throw error;
    }

    return result;
  }

  private async getSinglePage(
    itemsQuery: any,
    pageNumber: number,
    pageSize: number
  ): Promise<ISPPagedResult> {
    this.validatePageNumber(pageNumber);
    this.validatePageSize(pageSize, "pageSize");

    const iterator = itemsQuery.top(pageSize)[Symbol.asyncIterator]();
    let currentPage = 0;

    while (true) {
      const next = await iterator.next();

      if (next.done) {
        return {
          items: [],
          pageNumber,
          pageSize,
          hasNextPage: false,
        };
      }

      currentPage++;

      if (currentPage !== pageNumber) {
        continue;
      }

      const items = Array.isArray(next.value) ? next.value : [];

      // Consume one more iterator step to know for certain whether there
      // is another page. The next page is intentionally not returned; the
      // caller can request it normally. This costs one extra network call
      // per requested page but avoids reporting a false hasNextPage on an
      // exactly-full final page.
      const following = await iterator.next();

      return {
        items,
        pageNumber,
        pageSize,
        hasNextPage: !following.done,
      };
    }
  }

  private validatePageNumber(pageNumber: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(`pageNumber must be a positive integer. Received: ${pageNumber}`);
    }
  }

  private validatePageSize(pageSize: number, propertyName: string = "pageSize"): void {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
      throw new Error(`${propertyName} must be an integer between 1 and ${DEFAULT_PAGE_SIZE}. Received: ${pageSize}`);
    }
  }

  /**
   * Centralized error normalization. We retain useful HTTP information while
   * exposing a consistent Error to the calling component.
   */
  private normalizeError(operation: string, error: unknown): never {
    const source = error as any;
    const status = source?.status ?? source?.data?.status;
    const statusText = source?.statusText ?? source?.data?.statusText;
    const message = source?.message || statusText || "Unknown SharePoint error";

    const suffix = status ? ` (HTTP ${status})` : "";

    const rawText = String(message).toLowerCase();
    let helpfulMessage = message;

    if (
      rawText.includes("list view threshold") ||
      rawText.includes("exceeds the list view threshold") ||
      rawText.includes("too many resources") ||
      rawText.includes("non-indexed")
    ) {
      helpfulMessage =
        `${message} | This is a SharePoint large-list/threshold query issue. ` +
        `Use an indexed filter column and avoid non-indexed filter/orderBy operations ` +
        `on lists above 5,000 items. Paging alone cannot bypass a threshold-blocked query.`;
    } else if (status === 412) {
      helpfulMessage = `${message} | The item/file may have changed since it was read (ETag/concurrency conflict).`;
    } else if (status === 401 || status === 403) {
      helpfulMessage = `${message} | Check the current user's SharePoint permissions and authentication context.`;
    } else if (status === 404) {
      helpfulMessage = `${message} | Verify that the list, item, folder, or file still exists at the supplied path/ID.`;
    } else if (status === 429 || status === 503 || status === 504) {
      helpfulMessage = `${message} | SharePoint may be throttling or temporarily unavailable. Retry logic/backoff should be allowed to handle transient failures.`;
    }

    const normalized = new Error(`[SPCRUDOPS] ${operation} failed${suffix}: ${helpfulMessage}`);

    // Preserve the original values for debugging without requiring callers
    // to know the PnPjs error class used internally.
    (normalized as any).status = status;
    (normalized as any).statusText = statusText;
    (normalized as any).originalError = error;

    console.error(normalized.message, error);
    throw normalized;
  }

  private async run<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      return this.normalizeError(operation, error);
    }
  }

  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }

  /**
   * Fetches all matching items by consuming SharePoint pages sequentially.
   *
   * IMPORTANT: this handles result paging beyond 5,000, but it cannot make an
   * otherwise-threshold-blocked query legal. For large lists, filters/orderBy
   * should use appropriate indexed columns.
   */
  async getData(
    listName: string,
    columnsToRetrieve: string,
    columnsToExpand: string,
    filters: string,
    orderby: ISPOrderBy,
    props: IMgDigitalApprovalProps
  ): Promise<any[]> {
    return this.run("getData", async () => {
      this.validateListName(listName);

      const sp = this.getSP(props);
      const items = this.applyQueryOptions(
        sp.web.lists.getByTitle(listName).items,
        columnsToRetrieve,
        columnsToExpand,
        filters,
        orderby
      );

      return await this.getAllItems(items);
    });
  }

  async getDataPage(
    listName: string,
    columnsToRetrieve: string,
    columnsToExpand: string,
    filters: string,
    orderby: ISPOrderBy,
    pageNumber: number,
    pageSize: number = DEFAULT_UI_PAGE_SIZE,
    props: IMgDigitalApprovalProps
  ): Promise<ISPPagedResult> {
    return this.run("getDataPage", async () => {
      this.validateListName(listName);
      this.validatePageNumber(pageNumber);
      this.validatePageSize(pageSize);

      const sp = this.getSP(props);
      const items = this.applyQueryOptions(
        sp.web.lists.getByTitle(listName).items,
        columnsToRetrieve,
        columnsToExpand,
        filters,
        orderby
      );

      return await this.getSinglePage(items, pageNumber, pageSize);
    });
  }

  async getRootData(
    listName: string,
    columnsToRetrieve: string,
    columnsToExpand: string,
    filters: string,
    orderby: ISPOrderBy,
    props: IMgDigitalApprovalProps
  ): Promise<any[]> {
    return this.run("getRootData", async () => {
      this.validateListName(listName);

      const sp = this.getSP(props);

      // PnPjs v4 provides a dedicated root-web API. This avoids the old
      // brittle URL splitting logic used by the v2 implementation.
      const rootWeb = await sp.site.getRootWeb();

      const items = this.applyQueryOptions(
        rootWeb.lists.getByTitle(listName).items,
        columnsToRetrieve,
        columnsToExpand,
        filters,
        orderby
      );

      return await this.getAllItems(items);
    });
  }

  async insertData(listName: string, data: any, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("insertData", async () => {
      this.validateListName(listName);
      this.validatePayload(data, "insertData");

      const sp = this.getSP(props);
      return await sp.web.lists.getByTitle(listName).items.add(data);
    });
  }

  async updateData(listName: string, itemId: number, data: any, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("updateData", async () => {
      this.validateListName(listName);
      this.validateItemId(itemId);
      this.validatePayload(data, "updateData");

      const sp = this.getSP(props);
      return await sp.web.lists.getByTitle(listName).items.getById(itemId).update(data);
    });
  }

  async deleteData(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("deleteData", async () => {
      this.validateListName(listName);
      this.validateItemId(itemId);

      const sp = this.getSP(props);
      // Preserve the old deleteData behavior: recycle, do not permanently delete.
      return await sp.web.lists.getByTitle(listName).items.getById(itemId).recycle();
    });
  }

  async deleteDataPermanent(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("deleteDataPermanent", async () => {
      this.validateListName(listName);
      this.validateItemId(itemId);

      const sp = this.getSP(props);
      return await sp.web.lists.getByTitle(listName).items.getById(itemId).delete();
    });
  }

  async getListInfo(listName: string, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("getListInfo", async () => {
      this.validateListName(listName);

      const sp = this.getSP(props);
      return await sp.web.lists.getByTitle(listName)();
    });
  }

  async getListData(listName: string, columnsToRetrieve: string, props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("getListData", async () => {
      this.validateListName(listName);

      const sp = this.getSP(props);
      const selectFields = this.parseFields(columnsToRetrieve);

      let items = sp.web.lists.getByTitle(listName).items;
      if (selectFields.length) {
        items = items.select(...selectFields);
      }

      // Preserve the old behavior of returning SharePoint's normal result page.
      return await items();
    });
  }

  async batchInsert(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("batchInsert", async () => {
      this.validateListName(listName);
      this.validateBatch(data, "batchInsert");

      if (data.length === 0) {
        return [];
      }

      data.forEach((item, index) => {
        this.validatePayload(item, `batchInsert item ${index + 1}`);
      });

      const sp = this.getSP(props);
      const results: any[] = [];

      for (const chunk of this.chunkArray(data, BATCH_CHUNK_SIZE)) {
        const [batchedSP, execute] = sp.batched();
        const list = batchedSP.web.lists.getByTitle(listName);
        const requests = chunk.map((item) => list.items.add(item));

        await execute();
        results.push(...await Promise.all(requests));
      }

      return results;
    });
  }

  async batchUpdate(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("batchUpdate", async () => {
      this.validateListName(listName);
      this.validateBatch(data, "batchUpdate");

      if (data.length === 0) {
        return [];
      }

      data.forEach((item, index) => {
        this.validatePayload(item, `batchUpdate item ${index + 1}`);
        this.validateItemId(item.Id);

        const keys = Object.keys(item).filter((key) => key !== "Id");
        if (keys.length === 0) {
          throw new Error(`batchUpdate item ${index + 1} must contain at least one field besides Id.`);
        }
      });

      const sp = this.getSP(props);
      const results: any[] = [];

      for (const chunk of this.chunkArray(data, BATCH_CHUNK_SIZE)) {
        const [batchedSP, execute] = sp.batched();
        const list = batchedSP.web.lists.getByTitle(listName);

        const requests = chunk.map((item) => {
          const { Id, ...updateData } = item;
          return list.items.getById(Id).update(updateData);
        });

        await execute();
        results.push(...await Promise.all(requests));
      }

      return results;
    });
  }

  async batchDelete(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("batchDelete", async () => {
      this.validateListName(listName);
      this.validateBatch(data, "batchDelete");

      if (data.length === 0) {
        return [];
      }

      data.forEach((item, index) => {
        this.validatePayload(item, `batchDelete item ${index + 1}`);
        this.validateItemId(item.Id);
      });

      const sp = this.getSP(props);
      const results: any[] = [];

      for (const chunk of this.chunkArray(data, BATCH_CHUNK_SIZE)) {
        const [batchedSP, execute] = sp.batched();
        const list = batchedSP.web.lists.getByTitle(listName);
        const requests = chunk.map((item) => list.items.getById(item.Id).recycle());

        await execute();
        results.push(...await Promise.all(requests));
      }

      return results;
    });
  }

  async batchDeletePermanent(listName: string, data: any[], props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("batchDeletePermanent", async () => {
      this.validateListName(listName);
      this.validateBatch(data, "batchDeletePermanent");

      if (data.length === 0) {
        return [];
      }

      data.forEach((item, index) => {
        this.validatePayload(item, `batchDeletePermanent item ${index + 1}`);
        this.validateItemId(item.Id);
      });

      const sp = this.getSP(props);
      const results: any[] = [];

      for (const chunk of this.chunkArray(data, BATCH_CHUNK_SIZE)) {
        const [batchedSP, execute] = sp.batched();
        const list = batchedSP.web.lists.getByTitle(listName);
        const requests = chunk.map((item) => list.items.getById(item.Id).delete());

        await execute();
        results.push(...await Promise.all(requests));
      }

      return results;
    });
  }

  async createFolder(listName: string, folderName: string, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("createFolder", async () => {
      this.validateListName(listName);

      if (typeof folderName !== "string" || !folderName.trim()) {
        throw new Error("A valid folder name/path is required.");
      }

      const sp = this.getSP(props);
      const list = sp.web.lists.getByTitle(listName);
      const rootFolder = await list.rootFolder.select("ServerRelativeUrl")();
      const rootFolderUrl = rootFolder?.ServerRelativeUrl;

      if (!rootFolderUrl) {
        throw new Error(`Unable to resolve the root folder for list '${listName}'.`);
      }

      // addUsingPath accepts a folder path relative to the resolved list/library
      // root. Parent folders must already exist for nested paths.
      return await sp.web
        .getFolderByServerRelativePath(rootFolderUrl)
        .folders
        .addUsingPath(folderName.trim());
    });
  }

  async uploadFile(folderServerRelativeUrl: string, file: File, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("uploadFile", async () => {
      if (typeof folderServerRelativeUrl !== "string" || !folderServerRelativeUrl.trim()) {
        throw new Error("A valid folder server-relative URL is required.");
      }

      if (!(file instanceof File)) {
        throw new Error("A valid File object is required.");
      }

      if (!file.name.trim()) {
        throw new Error("The file must have a valid file name.");
      }

      const sp = this.getSP(props);
      const folder = sp.web.getFolderByServerRelativePath(folderServerRelativeUrl.trim());

      if (file.size <= CHUNKED_UPLOAD_THRESHOLD_BYTES) {
        return await folder.files.addUsingPath(file.name, file, {
          Overwrite: true,
        });
      }

      return await folder.files.addChunked(file.name, file, {
        Overwrite: true,
      });
    });
  }

  async deleteFile(fileServerRelativeUrl: string, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("deleteFile", async () => {
      if (typeof fileServerRelativeUrl !== "string" || !fileServerRelativeUrl.trim()) {
        throw new Error("A valid file server-relative URL is required.");
      }

      const sp = this.getSP(props);
      // Preserve the old deleteFile behavior: recycle the file.
      return await sp.web.getFileByServerRelativePath(fileServerRelativeUrl.trim()).recycle();
    });
  }

  async currentProfile(props: IMgDigitalApprovalProps): Promise<any | null> {
    try {
      const sp = this.getSP(props);
      return await sp.profiles.myProperties();
    } catch (error) {
      // Preserve the old contract: profile failures return null instead of
      // breaking the whole application initialization flow.
      console.error("[SPCRUDOPS] Error fetching user profile", error);
      return null;
    }
  }

  async getLoggedInSiteGroups(props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("getLoggedInSiteGroups", async () => {
      const sp = this.getSP(props);
      return await sp.web.currentUser.groups();
    });
  }

  async getAllSiteGroups(props: IMgDigitalApprovalProps): Promise<any[]> {
    return this.run("getAllSiteGroups", async () => {
      const sp = this.getSP(props);
      return await sp.web.siteGroups();
    });
  }

  async ensureUser(loginName: string, props: IMgDigitalApprovalProps): Promise<any> {
    return this.run("ensureUser", async () => {
      if (typeof loginName !== "string" || !loginName.trim()) {
        throw new Error("A valid login name is required.");
      }

      const sp = this.getSP(props);
      // PnPjs v4 returns the user info directly; older builds wrapped it in `.data`.
      const result: any = await sp.web.ensureUser(loginName.trim());
      return result && result.data ? result.data : result;
    });
  }

  async getTopData(
    listName: string,
    columnsToRetrieve: string,
    columnsToExpand: string,
    filters: string,
    orderby: ISPOrderBy,
    top: number,
    props: IMgDigitalApprovalProps
  ): Promise<any[]> {
    return this.run("getTopData", async () => {
      this.validateListName(listName);

      if (top !== 0 && (!Number.isInteger(top) || top < 0)) {
        throw new Error(`top must be 0 or a positive integer. Received: ${top}`);
      }

      const sp = this.getSP(props);
      let items = this.applyQueryOptions(
        sp.web.lists.getByTitle(listName).items,
        columnsToRetrieve,
        columnsToExpand,
        filters,
        orderby
      );

      // Preserve old behavior: top=0/false means no explicit $top.
      if (top > 0) {
        items = items.top(top);
      }

      return await items();
    });
  }

  async addAttchmentInList(
    data: File,
    listName: string,
    itemId: number,
    fileName: string,
    props: IMgDigitalApprovalProps
  ): Promise<any> {
    return this.addAttachmentInList(data, listName, itemId, fileName, props);
  }

  async addAttachmentInList(
    data: File,
    listName: string,
    itemId: number,
    fileName: string,
    props: IMgDigitalApprovalProps
  ): Promise<any> {
    return this.run("addAttachmentInList", async () => {
      this.validateListName(listName);
      this.validateItemId(itemId);

      if (!(data instanceof File)) {
        throw new Error("A valid File object is required.");
      }

      if (typeof fileName !== "string" || !fileName.trim()) {
        throw new Error("A valid attachment file name is required.");
      }

      const sp = this.getSP(props);
      // Attachment behavior intentionally remains non-destructive: if the
      // same name already exists, SharePoint will reject the add operation.
      return await sp.web.lists
        .getByTitle(listName)
        .items.getById(itemId)
        .attachmentFiles.add(fileName.trim(), data);
    });
  }
}

/**
 * Factory preserved from the previous implementation for compatibility with
 * callers that already await SPCRUDOPS().
 */
export default function SPCRUDOPS(): Promise<ISPCRUDOPS> {
  return Promise.resolve(new SPCRUDOPSImpl());
}
