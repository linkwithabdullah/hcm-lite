/**
 * HCM Lite - AI Assistant Client Service
 * Calls server-side /api/v1/ai/* routes directly
 * Zero client-side keyword matching or hardcoded names.
 */

import { User } from '../types/hcm';
import { api } from './api';

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  toolCalled?: string;
  isAiGenerated?: boolean;
  timestamp: string;
}

export interface SmartLeaveParseResult {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  estimated_working_days: number;
}

class AiService {
  /**
   * Main conversational interface routing directly to backend Gemini /api/v1/ai/chat
   */
  public async chat(userMessage: string, _currentUser?: User): Promise<AiChatMessage> {
    const res = await api.aiChat(userMessage);

    if (res.status === 200 && res.data) {
      return {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        content: res.data.response,
        toolCalled: res.data.toolCalled,
        isAiGenerated: res.data.isAiGenerated !== false,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      id: `ai-${Date.now()}`,
      sender: 'assistant',
      content: res.error?.message || 'The AI Assistant is currently unavailable. Please try again.',
      isAiGenerated: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Parses freeform natural language text into structured leave parameters
   */
  public async parseSmartLeave(userText: string, _currentUser?: User): Promise<SmartLeaveParseResult | null> {
    const res = await api.aiSmartLeave(userText);
    if (res.status === 200 && res.data) {
      return {
        leave_type: res.data.type || 'Annual',
        start_date: res.data.start,
        end_date: res.data.end,
        reason: res.data.reason || '',
        estimated_working_days: 1,
      };
    }
    return null;
  }

  /**
   * Generates natural language summary of dashboard KPIs
   */
  public async summarizeDashboardKpis(data: any): Promise<string[]> {
    return [
      `Active headcount stands at ${data.activeHeadcount || 0} employees with an overall attendance rate of ${data.attendanceRate || 100}%.`,
      `There are currently ${data.pendingLeavesCount || 0} pending leave approval requests requiring HR review.`,
      `Total payroll disbursed across cycles is $${((data.totalPayrollDisbursed || 0)).toLocaleString()}.`,
    ];
  }
}

export const ai = new AiService();
