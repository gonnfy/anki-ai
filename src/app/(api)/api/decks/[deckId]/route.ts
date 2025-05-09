import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth'; // Adjusted import path
import { deleteDeck, getDeckById } from '@/services/deck.service'; // Adjusted import path - Added getDeckById
import { isAppError, NotFoundError, PermissionError, DatabaseError } from '@/lib/errors'; // Adjusted import path
import { ApiErrorResponse } from '@/types/api.types'; // Added import for error response type
import { deckUpdateSchema, DeckUpdatePayload } from '@/lib/zod'; // Adjusted import path
import { updateDeck } from '@/services/deck.service'; // Adjusted import path
import { ERROR_CODES, handleApiError } from '@/lib/errors'; // Adjusted import path

// GET handler to retrieve a specific deck by ID
export async function GET(
  request: Request, // Keep request parameter as per Next.js convention
  context: { params: { deckId: string } } // Use context, removed locale
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      const errorResponse: ApiErrorResponse = { error: 'UNAUTHORIZED', message: 'Authentication required.' };
      return NextResponse.json(errorResponse, { status: 401 });
    }

    const { deckId } = context.params; // Await params

    // Validate deckId format if necessary (e.g., using a regex or library)
    // Example: if (!isValidUUID(deckId)) { return NextResponse.json({ error: 'BAD_REQUEST', message: 'Invalid Deck ID format.' }, { status: 400 }); }

    const deckData = await getDeckById(userId, deckId);

    // Successfully retrieved, return deck data
    return NextResponse.json(deckData, { status: 200 });

  } catch (error) {
    console.error('Error fetching deck:', error); // Log the error server-side

    if (isAppError(error)) {
      let status = 500;
      let errorCode: ApiErrorResponse['error'] = 'INTERNAL_SERVER_ERROR'; // Default error code

      if (error instanceof NotFoundError) {
        status = 404;
        errorCode = 'NOT_FOUND';
      } else if (error instanceof PermissionError) {
        status = 403;
        errorCode = 'FORBIDDEN';
      } else if (error instanceof DatabaseError) {
        status = 500;
        errorCode = 'DATABASE_ERROR';
      } else {
        // Use error name for other specific AppErrors if needed, otherwise keep default
        errorCode = error.name as ApiErrorResponse['error']; // Cast, assuming error names match ApiErrorResponse types
      }

      const errorResponse: ApiErrorResponse = { error: errorCode, message: error.message };
      return NextResponse.json(errorResponse, { status });
    }

    // Handle unexpected errors
    const errorResponse: ApiErrorResponse = { error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected internal server error occurred.' };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}


export async function DELETE(
  request: Request, // Keep request parameter as per Next.js convention, though unused
  context: { params: { deckId: string } } // Use context, removed locale
) {
  try {
    const { deckId } = await context.params; // Await params
    const userId = await getServerUserId();
    if (!userId) {
      const errorResponse: ApiErrorResponse = { error: 'UNAUTHORIZED', message: 'Authentication required.' }; // Updated message
      return NextResponse.json(errorResponse, { status: 401 });
    }

    // deckId is now available here after await

    await deleteDeck(userId, deckId);

    // Successfully deleted, return 204 No Content
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error('Error deleting deck:', error); // Log the error for debugging

    if (isAppError(error)) {
      let status = 500;
      let errorCode: ApiErrorResponse['error'] = 'INTERNAL_SERVER_ERROR'; // Define errorCode here

      if (error instanceof NotFoundError) {
        status = 404;
        errorCode = 'NOT_FOUND'; // Assign specific code
      } else if (error instanceof PermissionError) {
        status = 403;
        errorCode = 'FORBIDDEN'; // Assign specific code
      } else if (error instanceof DatabaseError) {
        // Keep status 500 for DatabaseError or use a specific code if preferred
        status = 500;
        errorCode = 'DATABASE_ERROR'; // Assign specific code
      } else {
         // Use error name for other specific AppErrors if needed, otherwise keep default
        errorCode = error.name as ApiErrorResponse['error']; // Cast, assuming error names match ApiErrorResponse types
      }
      // Use specific error codes as defined above
      const errorResponse: ApiErrorResponse = { error: errorCode, message: error.message }; // Use errorCode
      return NextResponse.json(errorResponse, { status });
    }

    // Handle unexpected errors
    const errorResponse: ApiErrorResponse = { error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected internal server error occurred.' }; // Updated message
    return NextResponse.json(errorResponse, { status: 500 });
  }
}


// --- PUT ハンドラ (Result パターン対応) ---
export async function PUT(
  request: Request,
  context: { params: { deckId: string } }
) {
  try { // ★ ボディパースや Zod パースでの throw をキャッチする外側の try ★
    // 1. Authentication
    const userId = await getServerUserId();
    if (!userId) {
      // Use ERROR_CODES for consistency
      return NextResponse.json({ error: ERROR_CODES.AUTHENTICATION_FAILED, message: 'Authentication required.' }, { status: 401 });
    }

    // 2. Extract deckId
    const { deckId } = await context.params; // Await params as it's async now
    if (!deckId) {
        // Use ERROR_CODES
        return NextResponse.json({ error: ERROR_CODES.VALIDATION_ERROR, message: 'Missing deckId in URL.' }, { status: 400 });
    }

    // 3. Get and Parse Request Body
    let body: unknown;
    try {
      body = await request.json();
    } catch (_e) {
      // Use ERROR_CODES
      return NextResponse.json({ error: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid JSON body.' }, { status: 400 });
    }

    // 4. Input Validation (Zod) - safeParse を使用
    const validation = deckUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid input data for update.',
          // Provide flattened errors for better client-side handling
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    // Type assertion is safe here due to the success check
    const validatedData = validation.data as DeckUpdatePayload;

    // 5. Service Call (try...catch は不要 for AppErrors handled by Result)
    const result = await updateDeck(userId, deckId, validatedData);

    // 6. Handle Result
    if (result.ok) {
      // Success Response
      return NextResponse.json(result.value, { status: 200 });
    } else {
      // Error Handling using centralized handler
      // result.error is guaranteed to be AppError based on updateDeck signature
      return handleApiError(result.error);
    }

  } catch (error) {
     // Catch unexpected errors (e.g., network issues, runtime errors outside service call)
     // Pass the caught error to the centralized handler
     return handleApiError(error);
  }
}