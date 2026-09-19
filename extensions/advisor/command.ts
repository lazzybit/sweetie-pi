/**
 * Advisor settings command.
 *
 * Registers `/settings-advisor`, a SettingsList with three items: whether the
 * advisor tool is enabled, which advisor model it uses, and the thinking
 * level requested from that model. Model and thinking level open searchable
 * pickers; choosing a model stores its provider and id together, and the
 * thinking levels follow the built-in `/thinking` logic (levels supported by
 * the selected model). Only the TUI and the sequencing of reads/writes live
 * here, persistence is delegated to config.ts.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  DynamicBorder,
  getSelectListTheme,
  getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Model,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  Container,
  fuzzyFilter,
  Input,
  SelectList,
  Spacer,
  Text,
  type Component,
  type KeybindingsManager,
  type SelectItem,
  type SettingItem,
  SettingsList,
} from "@earendil-works/pi-tui";
import type { AdvisorConfig } from "./config.ts";
import { errorText } from "./execute.ts";
import {
  ADVISOR_COMMAND_DESCRIPTION,
  ADVISOR_COMMAND_NAME,
  ADVISOR_ENABLED_DESCRIPTION,
  ADVISOR_ENABLED_LABEL,
  ADVISOR_MODEL_DESCRIPTION,
  ADVISOR_MODEL_LABEL,
  ADVISOR_MODEL_SUBMENU_HINT,
  ADVISOR_MODEL_SUBMENU_TITLE,
  ADVISOR_NOT_SET,
  ADVISOR_NO_MODELS_DESCRIPTION,
  ADVISOR_NO_MODELS_LABEL,
  ADVISOR_SAVE_ERROR_MESSAGE,
  ADVISOR_THINKING_DEFAULT,
  ADVISOR_THINKING_DESCRIPTION,
  ADVISOR_THINKING_LABEL,
  ADVISOR_THINKING_LEVEL_DESCRIPTIONS,
  ADVISOR_THINKING_SUBMENU_HINT,
  ADVISOR_THINKING_SUBMENU_TITLE,
  ADVISOR_TUI_ONLY_MESSAGE,
} from "./prompt.ts";

export type AdvisorSettingsActions = {
  getConfig(): AdvisorConfig;
  setEnabled(ctx: ExtensionCommandContext, enabled: boolean): void;
  setModel(
    ctx: ExtensionCommandContext,
    provider: string,
    model: string,
  ): void;
  setThinkingLevel(
    ctx: ExtensionCommandContext,
    level: ModelThinkingLevel,
  ): void;
};

const NO_MODEL_VALUE = "__none__";

const FALLBACK_THINKING_LEVELS: readonly ModelThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const PICKER_LAYOUT = {
  minPrimaryColumnWidth: 16,
  maxPrimaryColumnWidth: 40,
};

function modelKey(model: Model<any>): string {
  return `${model.provider}/${model.id}`;
}

function modelLabel(model: Model<any>): string {
  return `${model.id} [${model.provider}]`;
}

function compareModels(a: Model<any>, b: Model<any>): number {
  return a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
}

function configuredModelKey(config: AdvisorConfig): string | undefined {
  if (!config.provider || !config.model) return undefined;
  return `${config.provider}/${config.model}`;
}

function thinkingLevelItems(
  levels: readonly ModelThinkingLevel[],
  current: ModelThinkingLevel | undefined,
): SelectItem[] {
  return levels.map((level) => ({
    value: level,
    label: `${level === current ? "\u2713 " : "  "}${level}`,
    description: ADVISOR_THINKING_LEVEL_DESCRIPTIONS[level],
  }));
}

/**
 * Searchable option list rendered inside a SettingsList submenu. Typing
 * filters by fuzzy match over the label and description, and Enter selects.
 */
class OptionPickerComponent extends Container {
  private readonly allItems: readonly SelectItem[];
  private readonly keybindings: KeybindingsManager;
  private readonly onSelect: (value: string) => void;
  private readonly onCancel: () => void;
  private readonly searchInput: Input;
  private readonly listContainer = new Container();
  private selectList: SelectList;

  constructor(
    title: string,
    hint: string,
    items: readonly SelectItem[],
    currentValue: string | undefined,
    keybindings: KeybindingsManager,
    onSelect: (value: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.allItems = items;
    this.keybindings = keybindings;
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    this.addChild(new Text(title, 1, 0));
    this.addChild(new Spacer(1));

    this.searchInput = new Input();
    this.searchInput.onSubmit = () => this.selectList.handleInput("\r");
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));

    this.selectList = this.buildList(items, currentValue);
    this.listContainer.addChild(this.selectList);
    this.addChild(this.listContainer);

    this.addChild(new Spacer(1));
    this.addChild(new Text(hint, 1, 0));
  }

  private buildList(
    items: readonly SelectItem[],
    currentValue: string | undefined,
  ): SelectList {
    const list = new SelectList(
      [...items],
      Math.min(items.length, 12),
      getSelectListTheme(),
      PICKER_LAYOUT,
    );
    if (currentValue !== undefined) {
      const index = items.findIndex((item) => item.value === currentValue);
      if (index >= 0) list.setSelectedIndex(index);
    }
    list.onSelect = (item) => this.onSelect(item.value);
    list.onCancel = this.onCancel;
    return list;
  }

  private applyFilter(query: string): void {
    const filtered = query
      ? fuzzyFilter(
          [...this.allItems],
          query,
          (item) => `${item.label} ${item.description ?? ""}`,
        )
      : [...this.allItems];
    this.selectList = this.buildList(filtered, undefined);
    this.listContainer.clear();
    this.listContainer.addChild(this.selectList);
  }

  handleInput(data: string): void {
    const isNavigation =
      this.keybindings.matches(data, "tui.select.up") ||
      this.keybindings.matches(data, "tui.select.down") ||
      this.keybindings.matches(data, "tui.select.confirm") ||
      this.keybindings.matches(data, "tui.select.cancel");
    if (isNavigation) {
      this.selectList.handleInput(data);
      return;
    }
    this.searchInput.handleInput(data);
    this.applyFilter(this.searchInput.getValue());
  }
}

async function showAdvisorSettings(
  ctx: ExtensionCommandContext,
  actions: AdvisorSettingsActions,
): Promise<void> {
  const models = [...ctx.modelRegistry.getAvailable()].sort(compareModels);
  const modelByValue = new Map(models.map((model) => [modelKey(model), model]));
  const modelItems: SelectItem[] = models.map((model) => ({
    value: modelKey(model),
    label: modelLabel(model),
  }));
  if (modelItems.length === 0) {
    modelItems.push({
      value: NO_MODEL_VALUE,
      label: ADVISOR_NO_MODELS_LABEL,
      description: ADVISOR_NO_MODELS_DESCRIPTION,
    });
  }

  const initialConfig = actions.getConfig();
  const configuredKey = configuredModelKey(initialConfig);
  const configuredModel = configuredKey
    ? modelByValue.get(configuredKey)
    : undefined;
  const initialModelValue = configuredModel
    ? modelLabel(configuredModel)
    : (configuredKey ?? ADVISOR_NOT_SET);

  await ctx.ui.custom((_tui, theme, keybindings, done) => {
    let enabled = initialConfig.enabled === true;
    let selectedKey = configuredKey;
    let selectedEffort = initialConfig.effort;

    const notifySaveError = (error: unknown): void => {
      ctx.ui.notify(
        `${ADVISOR_SAVE_ERROR_MESSAGE}: ${errorText(error)}`,
        "error",
      );
    };

    const items: SettingItem[] = [
      {
        id: "enabled",
        label: ADVISOR_ENABLED_LABEL,
        description: ADVISOR_ENABLED_DESCRIPTION,
        currentValue: enabled ? "true" : "false",
        values: ["true", "false"],
      },
      {
        id: "model",
        label: ADVISOR_MODEL_LABEL,
        description: ADVISOR_MODEL_DESCRIPTION,
        currentValue: initialModelValue,
        submenu: (_currentValue, closeSubmenu) =>
          new OptionPickerComponent(
            ADVISOR_MODEL_SUBMENU_TITLE,
            ADVISOR_MODEL_SUBMENU_HINT,
            modelItems,
            selectedKey,
            keybindings,
            (value) => {
              const model = modelByValue.get(value);
              if (!model) {
                closeSubmenu();
                return;
              }
              try {
                actions.setModel(ctx, model.provider, model.id);
              } catch (error) {
                notifySaveError(error);
                closeSubmenu();
                return;
              }
              selectedKey = value;
              // Keep the thinking level valid for the newly selected model.
              if (
                selectedEffort !== undefined &&
                !getSupportedThinkingLevels(model).includes(selectedEffort)
              ) {
                const clamped = clampThinkingLevel(model, selectedEffort);
                try {
                  actions.setThinkingLevel(ctx, clamped);
                  selectedEffort = clamped;
                } catch (error) {
                  notifySaveError(error);
                }
              }
              closeSubmenu(value);
            },
            () => closeSubmenu(),
          ),
      },
      {
        id: "thinking-level",
        label: ADVISOR_THINKING_LABEL,
        description: ADVISOR_THINKING_DESCRIPTION,
        currentValue: selectedEffort ?? ADVISOR_THINKING_DEFAULT,
        submenu: (_currentValue, closeSubmenu) => {
          const model = selectedKey ? modelByValue.get(selectedKey) : undefined;
          const levels = model
            ? getSupportedThinkingLevels(model)
            : FALLBACK_THINKING_LEVELS;
          return new OptionPickerComponent(
            ADVISOR_THINKING_SUBMENU_TITLE,
            ADVISOR_THINKING_SUBMENU_HINT,
            thinkingLevelItems(levels, selectedEffort),
            selectedEffort,
            keybindings,
            (value) => {
              const level = value as ModelThinkingLevel;
              try {
                actions.setThinkingLevel(ctx, level);
              } catch (error) {
                notifySaveError(error);
                closeSubmenu();
                return;
              }
              selectedEffort = level;
              closeSubmenu(value);
            },
            () => closeSubmenu(),
          );
        },
      },
    ];

    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("border", s)));
    container.addChild(new Spacer(1));

    const settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 15),
      getSettingsListTheme(),
      (id, newValue) => {
        if (id === "enabled") {
          const next = newValue === "true";
          try {
            actions.setEnabled(ctx, next);
            enabled = next;
          } catch (error) {
            settingsList.updateValue("enabled", enabled ? "true" : "false");
            notifySaveError(error);
          }
          return;
        }
        if (id === "model") {
          const model = modelByValue.get(newValue);
          settingsList.updateValue(
            "model",
            model ? modelLabel(model) : newValue,
          );
        }
      },
      () => done(undefined),
    );
    container.addChild(settingsList);
    container.addChild(new DynamicBorder((s: string) => theme.fg("border", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => settingsList.handleInput(data),
    } satisfies Component;
  });
}

export function registerAdvisorCommand(
  pi: ExtensionAPI,
  actions: AdvisorSettingsActions,
): void {
  pi.registerCommand(ADVISOR_COMMAND_NAME, {
    description: ADVISOR_COMMAND_DESCRIPTION,
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(ADVISOR_TUI_ONLY_MESSAGE, "warning");
        return;
      }
      await showAdvisorSettings(ctx, actions);
    },
  });
}
