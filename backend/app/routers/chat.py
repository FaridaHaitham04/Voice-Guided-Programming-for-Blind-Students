"""Chat endpoints: message history and RAG-powered tutor."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatMessage, CodeFile, User
from app.rag import ask_tutor
from app.schemas import ChatMessageOut, ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])


@router.get("/chat", response_model=list[ChatMessageOut])
def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the full chat history for the current user."""
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.id)
        .all()
    )
    return [
        ChatMessageOut(**{"from": msg.sender, "text": msg.text})
        for msg in messages
    ]


@router.post("/chat", response_model=ChatResponse)
def post_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Process a tutor question through the RAG pipeline.

    1. Save the user's message.
    2. Load code context (current file, cursor line).
    3. Run the RAG pipeline to generate a reply.
    4. Save the AI reply.
    5. Return the reply text.
    """
    # Save user message
    user_msg = ChatMessage(
        user_id=current_user.id,
        sender="you",
        text=body.text,
    )
    db.add(user_msg)
    db.commit()

    # Load code context
    code_context = ""
    if body.filename:
        file_row = (
            db.query(CodeFile)
            .filter(
                CodeFile.user_id == current_user.id,
                CodeFile.filename == body.filename,
            )
            .first()
        )
        if file_row:
            code_context = file_row.content

    # RAG pipeline
    reply_text = ask_tutor(
        question=body.text,
        code_context=code_context,
        filename=body.filename,
        cursor_line=body.cursor_line,
        db=db,
    )

    # Save AI reply
    ai_msg = ChatMessage(
        user_id=current_user.id,
        sender="ai",
        text=reply_text,
    )
    db.add(ai_msg)
    db.commit()

    return ChatResponse(reply=reply_text)
