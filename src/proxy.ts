import { NextRequest, NextResponse } from 'next/server'

// Next.js 16 requires either a named export `proxy` or a default export
export default function proxy(request: NextRequest) {
  // your logic here
  return NextResponse.next()
}

// Or use default export
// export default function proxy(request: NextRequest) { ... }

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
 
