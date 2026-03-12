/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 技能工具模块
 *
 * 该模块实现了技能工具功能，允许模型访问和执行用户自定义的技能。
 * 技能工具可以动态加载可用技能，并将其包含在工具描述中供模型选择。
 *
 * 主要功能：
 * - 动态加载和更新可用技能列表
 * - 提供技能执行接口
 * - 管理技能描述和架构
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { ToolResult, ToolResultDisplay } from './tools.js';
import type { Config } from '../config/config.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { SkillConfig } from '../skills/types.js';
import { logSkillLaunch, SkillLaunchEvent } from '../telemetry/index.js';
import path from 'path';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('SKILL');

/**
 * 技能工具参数接口
 * 定义调用技能工具时所需的参数
 */
export interface SkillParams {
  /** 技能名称，例如 "pdf" 或 "xlsx" */
  skill: string;
}

/**
 * Skill tool that enables the model to access skill definitions.
 * The tool dynamically loads available skills and includes them in its description
 * for the model to choose from.
 *
 * 技能工具类
 *
 * 继承自 BaseDeclarativeTool，提供技能加载和执行功能。
 * 该工具允许模型访问技能定义，动态加载可用技能并将其包含在工具描述中供模型选择。
 *
 * 主要功能：
 * - 动态加载和管理可用技能列表
 * - 根据可用技能更新工具描述和架构
 * - 验证技能参数
 * - 创建技能工具调用实例
 */
export class SkillTool extends BaseDeclarativeTool<SkillParams, ToolResult> {
  static readonly Name: string = ToolNames.SKILL;

  private skillManager: SkillManager;
  private availableSkills: SkillConfig[] = [];

  constructor(private readonly config: Config) {
    // Initialize with a basic schema first
    const initialSchema = {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'The skill name (no arguments). E.g., "pdf" or "xlsx"',
        },
      },
      required: ['skill'],
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    };

    super(
      SkillTool.Name,
      ToolDisplayNames.SKILL,
      'Execute a skill within the main conversation. Loading available skills...', // Initial description
      Kind.Read,
      initialSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );

    const skillManager = config.getSkillManager();
    if (!skillManager) {
      throw new Error('SkillManager not available');
    }
    this.skillManager = skillManager;
    this.skillManager.addChangeListener(() => {
      void this.refreshSkills();
    });

    // Initialize the tool asynchronously
    this.refreshSkills();
  }

  /**
   * Asynchronously initializes the tool by loading available skills
   * and updating the description and schema.
   *
   * 异步刷新可用技能列表
   *
   * 通过加载可用技能并更新工具描述和架构来异步初始化工具。
   * 此方法会在技能管理器的技能列表发生变化时自动调用。
   */
  async refreshSkills(): Promise<void> {
    try {
      this.availableSkills = await this.skillManager.listSkills();
      this.updateDescriptionAndSchema();
    } catch (error) {
      debugLogger.warn('Failed to load skills for Skills tool:', error);
      this.availableSkills = [];
      this.updateDescriptionAndSchema();
    } finally {
      // Update the client with the new tools
      const geminiClient = this.config.getGeminiClient();
      if (geminiClient && geminiClient.isInitialized()) {
        await geminiClient.setTools();
      }
    }
  }

  /**
   * Updates the tool's description and schema based on available skills.
   *
   * 更新工具描述和架构
   *
   * 根据当前可用的技能列表，动态生成工具描述和架构。
   * 如果没有可用技能，会显示提示信息指导用户如何创建技能。
   */
  private updateDescriptionAndSchema(): void {
    let skillDescriptions = '';
    if (this.availableSkills.length === 0) {
      skillDescriptions =
        'No skills are currently configured. Skills can be created by adding directories with SKILL.md files to .qwen/skills/ or ~/.qwen/skills/.';
    } else {
      skillDescriptions = this.availableSkills
        .map(
          (skill) => `<skill>
<name>
${skill.name}
</name>
<description>
${skill.description} (${skill.level})
</description>
<location>
${skill.level}
</location>
</skill>`,
        )
        .join('\n');
    }

    const baseDescription = `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to invoke:
- Use this tool with the skill name only (no arguments)
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "xlsx"\` - invoke the xlsx skill
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- When executing scripts or loading referenced files, ALWAYS resolve absolute paths from skill's base directory. Examples:
  - \`bash scripts/init.sh\` -> \`bash /path/to/skill/scripts/init.sh\`
  - \`python scripts/helper.py\` -> \`python /path/to/skill/scripts/helper.py\`
  - \`reference.md\` -> \`/path/to/skill/reference.md\`
</skills_instructions>

<available_skills>
${skillDescriptions}
</available_skills>
`;
    // Update description using object property assignment
    (this as { description: string }).description = baseDescription;
  }

  /**
   * 验证技能工具参数
   *
   * 检查技能参数是否有效：
   * - 验证技能名称是否为非空字符串
   * - 验证技能是否存在于可用技能列表中
   *
   * @param params 技能参数对象
   * @returns 如果验证通过返回 null，否则返回错误消息
   */
  override validateToolParams(params: SkillParams): string | null {
    // Validate required fields
    if (
      !params.skill ||
      typeof params.skill !== 'string' ||
      params.skill.trim() === ''
    ) {
      return 'Parameter "skill" must be a non-empty string.';
    }

    // Validate that the skill exists
    const skillExists = this.availableSkills.some(
      (skill) => skill.name === params.skill,
    );

    if (!skillExists) {
      const availableNames = this.availableSkills.map((s) => s.name);
      if (availableNames.length === 0) {
        return `Skill "${params.skill}" not found. No skills are currently available.`;
      }
      return `Skill "${params.skill}" not found. Available skills: ${availableNames.join(', ')}`;
    }

    return null;
  }

  /**
   * 创建技能工具调用实例
   *
   * @param params 技能参数对象
   * @returns 技能工具调用实例
   */
  protected createInvocation(params: SkillParams) {
    return new SkillToolInvocation(this.config, this.skillManager, params);
  }

  /**
   * 获取所有可用技能的名称列表
   *
   * @returns 技能名称字符串数组
   */
  getAvailableSkillNames(): string[] {
    return this.availableSkills.map((skill) => skill.name);
  }
}

/**
 * 技能工具调用类
 *
 * 继承自 BaseToolInvocation，负责执行具体的技能加载和调用操作。
 *
 * 主要功能：
 * - 加载指定技能的内容
 * - 处理技能执行错误
 * - 记录技能执行日志
 * - 返回技能内容供模型使用
 */
class SkillToolInvocation extends BaseToolInvocation<SkillParams, ToolResult> {
  /**
   * 构造函数
   *
   * @param config 配置对象
   * @param skillManager 技能管理器实例
   * @param params 技能参数
   */
  constructor(
    private readonly config: Config,
    private readonly skillManager: SkillManager,
    params: SkillParams,
  ) {
    super(params);
  }

  /**
   * 获取工具调用描述
   *
   * @returns 描述字符串，包含要使用的技能名称
   */
  getDescription(): string {
    return `Use skill: "${this.params.skill}"`;
  }

  /**
   * 判断执行前是否需要确认
   *
   * 技能加载是只读操作，不需要用户确认。
   *
   * @returns 始终返回 false
   */
  override async shouldConfirmExecute(): Promise<false> {
    // Skill loading is a read-only operation, no confirmation needed
    return false;
  }

  /**
   * 执行技能工具调用
   *
   * 加载指定的技能并返回其内容。
   * 会处理各种错误情况，包括技能未找到、解析错误等。
   * 同时会记录技能执行的成功或失败状态。
   *
   * @param _signal 中止信号（未使用）
   * @param _updateOutput 输出更新回调（未使用）
   * @returns 工具执行结果，包含技能内容或错误信息
   */
  async execute(
    _signal?: AbortSignal,
    _updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ToolResult> {
    try {
      // Load the skill with runtime config (includes additional files)
      const skill = await this.skillManager.loadSkillForRuntime(
        this.params.skill,
      );

      if (!skill) {
        // Log failed skill launch
        logSkillLaunch(
          this.config,
          new SkillLaunchEvent(this.params.skill, false),
        );

        // Get parse errors if any
        const parseErrors = this.skillManager.getParseErrors();
        const errorMessages: string[] = [];

        for (const [filePath, error] of parseErrors) {
          if (filePath.includes(this.params.skill)) {
            errorMessages.push(`Parse error at ${filePath}: ${error.message}`);
          }
        }

        const errorDetail =
          errorMessages.length > 0
            ? `\nErrors:\n${errorMessages.join('\n')}`
            : '';

        return {
          llmContent: `Skill "${this.params.skill}" not found.${errorDetail}`,
          returnDisplay: `Skill "${this.params.skill}" not found.${errorDetail}`,
        };
      }

      // Log successful skill launch
      logSkillLaunch(
        this.config,
        new SkillLaunchEvent(this.params.skill, true),
      );

      const baseDir = path.dirname(skill.filePath);

      // Build markdown content for LLM (show base dir, then body)
      const llmContent = `Base directory for this skill: ${baseDir}\nImportant: ALWAYS resolve absolute paths from this base directory when working with skills.\n\n${skill.body}\n`;

      return {
        llmContent: [{ text: llmContent }],
        returnDisplay: skill.description,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      debugLogger.error(`[SkillsTool] Error using skill: ${errorMessage}`);

      // Log failed skill launch
      logSkillLaunch(
        this.config,
        new SkillLaunchEvent(this.params.skill, false),
      );

      return {
        llmContent: `Failed to load skill "${this.params.skill}": ${errorMessage}`,
        returnDisplay: `Failed to load skill "${this.params.skill}": ${errorMessage}`,
      };
    }
  }
}
