// Code by Jamesolof
// Modified 5/9/25

import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";

export default async function () {
  const schemaId = "builtin:alerting.maintenance-window";
  const windowTable = [];
  let nextPageKey = undefined;

  do {
    // Build request: initial uses schemaId, subsequent use nextPageKey
    const requestParams = nextPageKey
      ? { nextPageKey }
      : { schemaIds: schemaId };

    // Fetch a page of maintenance windows
    const response = await settingsObjectsClient.getSettingsObjects(requestParams);
    const maintenanceWindows = response.items || [];

    for (const window of maintenanceWindows) {
      // Parse and validate schedule times
      const start = new Date(window?.value?.schedule?.onceRecurrence?.startTime);
      const end = new Date(window?.value?.schedule?.onceRecurrence?.endTime);
      if (isNaN(start) || isNaN(end)) continue;

      const durationInDays = (end - start) / (1000 * 60 * 60 * 24);
      const filters = window?.value?.filters || [];

      // Prepare all possible filter outputs
      const ids = [];
      const hostShortNames = [];
      const tagFallbacks = [];

      for (const filter of filters) {
        // Extract from common entity ID fields
        ["entityIds", "entities"].forEach((key) => {
          const values = filter[key];
          if (Array.isArray(values)) {
            for (const id of values) {
              if (typeof id === "string" && id.trim()) {
                ids.push(id.trim());
              }
            }
          }
        });

        // Handle single entityId
        if (typeof filter.entityId === "string" && filter.entityId.trim()) {
          ids.push(filter.entityId.trim());
        }

        // Extract from tags
        const tags = filter.entityTags || [];
        for (const tag of tags) {
          if (typeof tag !== "string") continue;
          if (tag.startsWith("HostShortName:")) {
            const name = tag.split("HostShortName:")[1];
            if (name) hostShortNames.push(name.trim());
          } else {
            tagFallbacks.push(tag.trim());
          }
        }
      }

      // Choose the best available filter representation
      const finalFilters =
        ids.length > 0
          ? ids
          : hostShortNames.length > 0
          ? hostShortNames
          : tagFallbacks.length > 0
          ? tagFallbacks
          : filters;

      // Push processed result to output table
      windowTable.push({
        name: window?.value?.generalProperties?.name || "Unnamed",
        description: window?.value?.generalProperties?.description || "",
        duration: durationInDays,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        filters: finalFilters,
      });
    }

    nextPageKey = response.nextPageKey;
  } while (nextPageKey);

  // Sort by duration: longest at top
  windowTable.sort((a, b) => b.duration - a.duration);

  return windowTable;
}
